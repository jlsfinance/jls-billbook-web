
import {
  Customer, Invoice, Product, DEFAULT_COMPANY, CompanyProfile, CustomerNotification,
  FirebaseConfig, Payment, Expense, AdminAd, StockMovement, StockEntry, BarcodeScanEvent,
  VoucherType, BankAccount, AccountTransaction, Godown, GodownTransfer, AutomatedBill, StaffMember
} from '../types';
import { FirebaseService } from './firebaseService';
import { findProductByBarcode as findProductByBarcodePure, isBarcodeTaken as isBarcodeTakenPure, normalizeBarcode, detectBarcodeFormat } from './barcodeService';
import { buildMovement, validateMovement, applyDeltaToProduct, hasIdempotencyKey, computeStockFromLedger, nextEntryNumber, reconcile } from './stockService';
import type { MovementInput } from './stockService';
import { addBillingDays, currentBillingDate, nextBillingDate, parseBillingDate } from './recurringBilling';
import { getInvoicePaid, getPaymentAllocations, roundCurrency } from './paymentAllocation';

const getActiveCompanyId = () => localStorage.getItem('active_company_id') || '';

const getKeys = () => {
  const activeIdentifier = cache.currentCompanyId ?? getActiveCompanyId();
  const keyPrefix = activeIdentifier && activeIdentifier !== 'default' ? `${activeIdentifier}_` : '';
  return {
    PRODUCTS: `app_${keyPrefix}products`,
    CUSTOMERS: `app_${keyPrefix}customers`,
    INVOICES: `app_${keyPrefix}invoices`,
    PAYMENTS: `app_${keyPrefix}payments`,
    EXPENSES: `app_${keyPrefix}expenses`,
    PURCHASES: `app_${keyPrefix}purchases`,
    STOCK_MOVEMENTS: `app_${keyPrefix}stock_movements`,
    STOCK_ENTRIES: `app_${keyPrefix}stock_entries`,
    BANK_ACCOUNTS: `app_${keyPrefix}bank_accounts`,
    ACCOUNT_TXNS: `app_${keyPrefix}account_txns`,
    GODOWNS: `app_${keyPrefix}godowns`,
    GODOWN_TRANSFERS: `app_${keyPrefix}godown_transfers`,
    AUTOMATED_BILLS: `app_${keyPrefix}automated_bills`,
    STAFF_MEMBERS: `app_${keyPrefix}staff_members`,
    COMPANY: `app_${keyPrefix}company`,
    FIREBASE_CONFIG: `app_${keyPrefix}firebase_config`,
    CONTACT_PREFERENCE: `app_${keyPrefix}contact_preference`,
    PRIVACY_ACCEPTED: `app_${keyPrefix}privacy_accepted`,
    ADMIN_ADS: 'app_system_admin_ads',
    COMPANIES_LIST: 'app_system_companies_list',
  };
};

// YOUR FIREBASE CONFIGURATION (Hardcoded as requested)
const DEFAULT_FIREBASE_CONFIG: FirebaseConfig = {
  apiKey: "AIzaSyDOhuszbQuXpMO0WY-FXzkyY8dABjj4MHg",
  authDomain: "sample-firebase-ai-app-1f72d.firebaseapp.com",
  projectId: "sample-firebase-ai-app-1f72d",
  storageBucket: "sample-firebase-ai-app-1f72d.firebasestorage.app",
  messagingSenderId: "231225025529",
  appId: "1:231225025529:web:e079fe0aa1be713625d328"
};

// Initial Data Seeding
const SEED_PRODUCTS: Product[] = [
  { id: '1', name: 'Product A', price: 500, stock: 100, category: 'Electronics' },
  { id: '2', name: 'Product B', price: 800, stock: 45, category: 'Electronics' },
];

const SEED_CUSTOMERS: Customer[] = [
  {
    id: 'c1',
    name: 'John Doe',
    company: 'XYZ Enterprises',
    email: 'john@xyz.com',
    phone: '9123456789',
    address: '456, Business Park, Mumbai',
    balance: 0,
    notifications: []
  },
];

// In-Memory Cache
let cache = {
  products: [] as Product[],
  customers: [] as Customer[],
  invoices: [] as Invoice[],
  purchases: [] as Invoice[],
  payments: [] as Payment[],
  expenses: [] as Expense[],
  stockMovements: [] as StockMovement[],
  stockEntries: [] as StockEntry[],
  bankAccounts: [] as BankAccount[],
  accountTransactions: [] as AccountTransaction[],
  godowns: [] as Godown[],
  godownTransfers: [] as GodownTransfer[],
  automatedBills: [] as AutomatedBill[],
  staffMembers: [] as StaffMember[],
  company: DEFAULT_COMPANY,
  isLoaded: false,
  currentUserId: null as string | null,
  currentCompanyId: null as string | null,
};
let loadSequence = 0;

const ensureDefaultAccountsAndGodowns = () => {
  const now = new Date().toISOString();
  if (cache.bankAccounts.length === 0) {
    cache.bankAccounts = [
      {
        id: 'cash_default',
        name: 'Cash in Hand',
        type: 'CASH',
        openingBalance: 0,
        balance: 0,
        isDefault: true,
        createdAt: now,
      },
      {
        id: 'bank_default',
        name: 'Primary Bank / UPI',
        type: 'BANK',
        openingBalance: 0,
        balance: 0,
        isDefault: false,
        createdAt: now,
      },
    ];
  }
  if (cache.godowns.length === 0) {
    cache.godowns = [
      {
        id: 'godown_main',
        name: 'Main Shop / Godown',
        isMain: true,
        createdAt: now,
      },
    ];
  }
};

function paymentAccount(payment: Payment) {
  return payment.accountId || (payment.mode === 'CASH' ? 'cash_default' : 'bank_default');
}

function postsToAccount(payment: Payment) {
  return !(payment.mode === 'CHEQUE' && (payment.chequeStatus === 'PENDING' || payment.chequeStatus === 'BOUNCED'));
}

function applyPaymentToAccount(payment: Payment, reverse: boolean) {
  if (!postsToAccount(payment)) return;
  const outgoing = payment.type === 'PAID';
  const party = cache.customers.find(customer => customer.id === payment.customerId);
  StorageService._creditOrDebitAccount(
    paymentAccount(payment),
    payment.amount * (outgoing ? -1 : 1) * (reverse ? -1 : 1),
    reverse ? (outgoing ? 'ADD_MONEY' : 'REDUCE_MONEY') : (outgoing ? 'PAYMENT' : 'RECEIPT'),
    reverse ? currentBillingDate() : payment.date,
    payment.id,
    party?.company || party?.name,
    reverse ? 'Reversal: payment adjustment' : payment.note || payment.notes || payment.reference,
  );
}

function applyPaymentToBillsAndParty(payment: Payment, reverse: boolean) {
  const outgoing = payment.type === 'PAID';
  const multiplier = reverse ? -1 : 1;
  const listKey = outgoing ? 'purchases' : 'invoices';
  const customer = cache.customers.find(item => item.id === payment.customerId);
  if (customer) {
    customer.balance = roundCurrency(customer.balance + payment.amount * (outgoing ? 1 : -1) * multiplier);
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), customer.id, customer);
  }

  let remaining = payment.amount;
  const applied = [];
  for (const allocation of getPaymentAllocations(payment)) {
    if (!Number.isFinite(allocation.amount) || allocation.amount <= 0 || remaining <= 0) continue;
    const index = cache[listKey].findIndex(invoice =>
      invoice.id === allocation.invoiceId && invoice.customerId === payment.customerId &&
      (reverse || !invoice.isDeleted) &&
      (!invoice.type || invoice.type === (outgoing ? 'PURCHASE' : 'SALE')),
    );
    if (index < 0) continue;
    const invoice = cache[listKey][index];
    const paid = getInvoicePaid(invoice);
    const room = reverse ? paid : Math.max(0, invoice.total - paid);
    const amount = roundCurrency(Math.min(allocation.amount, room, remaining));
    if (amount <= 0) continue;
    const nextPaid = roundCurrency(paid + amount * multiplier);
    const due = Math.max(0, roundCurrency(invoice.total - nextPaid));
    const updated: Invoice = {
      ...invoice,
      paidAmount: nextPaid,
      amountReceived: nextPaid,
      balanceDue: due,
      status: due === 0 ? 'PAID' : nextPaid > 0 ? 'PARTIAL' : 'PENDING',
    };
    cache[listKey][index] = updated;
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath(listKey), updated.id, updated);
    remaining = roundCurrency(remaining - amount);
    applied.push({ invoiceId: updated.id, invoiceNumber: updated.invoiceNumber, amount });
  }
  return applied;
}

function storePayment(payment: Payment, index: number) {
  if (index < 0) cache.payments = [payment, ...cache.payments];
  else cache.payments[index] = payment;
  StorageService.persistToLocalStorage();
  if (FirebaseService.isReady()) {
    const document = Object.fromEntries(Object.entries(payment).filter(([, value]) => value !== undefined));
    FirebaseService.saveDocument(StorageService.getCollectionPath('payments'), payment.id, document);
  }
}

export const StorageService = {
  getUserId: (): string | null => cache.currentUserId,

  getCompanyId: (): string => {
    return cache.currentCompanyId ?? '';
  },

  // --- Initialization ---
  init: async (userId: string | null = null, companyId?: string): Promise<void> => {
    const activeCid = companyId ?? getActiveCompanyId();
    if (cache.currentUserId !== userId || cache.currentCompanyId !== activeCid) {
      cache = {
        products: [], customers: [], invoices: [], purchases: [], payments: [], expenses: [],
        stockMovements: [], stockEntries: [],
        bankAccounts: [], accountTransactions: [], godowns: [], godownTransfers: [],
        automatedBills: [], staffMembers: [],
        company: DEFAULT_COMPANY, isLoaded: false, currentUserId: userId, currentCompanyId: activeCid
      };
    }

    if (cache.isLoaded) return;

    const load = ++loadSequence;
    const KEYS = getKeys();
    const connected = FirebaseService.init(DEFAULT_FIREBASE_CONFIG);

    if (connected && userId) {
      const userPath = activeCid && activeCid !== 'default'
        ? `users/${userId}/companies/${activeCid}`
        : `users/${userId}`;

      const [
        fbProducts, fbCustomers, fbInvoices, fbPurchases, fbPayments, fbExpenses,
        fbCompany, fbStockMovements, fbStockEntries,
        fbBankAccounts, fbAccountTxns, fbGodowns, fbGodownTransfers, fbAutoBills, fbStaff
      ] = await Promise.all([
        FirebaseService.fetchCollection<Product>(`${userPath}/products`),
        FirebaseService.fetchCollection<Customer>(`${userPath}/customers`),
        FirebaseService.fetchCollection<Invoice>(`${userPath}/invoices`),
        FirebaseService.fetchCollection<Invoice>(`${userPath}/purchases`),
        FirebaseService.fetchCollection<Payment>(`${userPath}/payments`),
        FirebaseService.fetchCollection<Expense>(`${userPath}/expenses`),
        FirebaseService.fetchCollection<CompanyProfile>(`${userPath}/company`),
        FirebaseService.fetchCollection<StockMovement>(`${userPath}/stock_movements`),
        FirebaseService.fetchCollection<StockEntry>(`${userPath}/stock_entries`),
        FirebaseService.fetchCollection<BankAccount>(`${userPath}/bank_accounts`),
        FirebaseService.fetchCollection<AccountTransaction>(`${userPath}/account_txns`),
        FirebaseService.fetchCollection<Godown>(`${userPath}/godowns`),
        FirebaseService.fetchCollection<GodownTransfer>(`${userPath}/godown_transfers`),
        FirebaseService.fetchCollection<AutomatedBill>(`${userPath}/automated_bills`),
        FirebaseService.fetchCollection<StaffMember>(`${userPath}/staff_members`),
      ]);
      if (load !== loadSequence) return;

      cache.products = fbProducts;
      cache.customers = fbCustomers;
      cache.invoices = fbInvoices;
      cache.purchases = fbPurchases;
      cache.payments = fbPayments;
      cache.expenses = fbExpenses;
      cache.company = fbCompany.length > 0 ? fbCompany[0] : DEFAULT_COMPANY;
      cache.stockMovements = fbStockMovements;
      cache.stockEntries = fbStockEntries;
      cache.bankAccounts = fbBankAccounts;
      cache.accountTransactions = fbAccountTxns;
      cache.godowns = fbGodowns;
      cache.godownTransfers = fbGodownTransfers;
      cache.automatedBills = fbAutoBills;
      cache.staffMembers = fbStaff;

      const isCloudEmpty = fbProducts.length === 0 && fbInvoices.length === 0 && fbCustomers.length === 0;
      if (isCloudEmpty && companyId === undefined) {
        const lsProducts = localStorage.getItem(KEYS.PRODUCTS);
        const lsCustomers = localStorage.getItem(KEYS.CUSTOMERS);
        const lsInvoices = localStorage.getItem(KEYS.INVOICES);
        const lsPurchases = localStorage.getItem(KEYS.PURCHASES);
        const lsPayments = localStorage.getItem(KEYS.PAYMENTS);
        const lsExpenses = localStorage.getItem(KEYS.EXPENSES);
        const lsCompany = localStorage.getItem(KEYS.COMPANY);

        if (lsProducts || lsInvoices || lsCustomers) {
          if (lsProducts) cache.products = JSON.parse(lsProducts);
          if (lsCustomers) cache.customers = JSON.parse(lsCustomers);
          if (lsInvoices) cache.invoices = JSON.parse(lsInvoices);
          if (lsPurchases) cache.purchases = JSON.parse(lsPurchases);
          if (lsPayments) cache.payments = JSON.parse(lsPayments);
          if (lsExpenses) cache.expenses = JSON.parse(lsExpenses);
          if (lsCompany) cache.company = JSON.parse(lsCompany);

          if (cache.products.length) FirebaseService.batchSave(`${userPath}/products`, cache.products);
          if (cache.customers.length) FirebaseService.batchSave(`${userPath}/customers`, cache.customers);
          if (cache.invoices.length) FirebaseService.batchSave(`${userPath}/invoices`, cache.invoices);
          if (cache.purchases.length) FirebaseService.batchSave(`${userPath}/purchases`, cache.purchases);
          if (cache.payments.length) FirebaseService.batchSave(`${userPath}/payments`, cache.payments);
          if (cache.expenses.length) FirebaseService.batchSave(`${userPath}/expenses`, cache.expenses);
          FirebaseService.saveDocument(`${userPath}/company`, 'profile', cache.company);
        }
      }

      ensureDefaultAccountsAndGodowns();
      cache.isLoaded = true;
      return;
    }

    if (!userId) {
      const parseLS = <T>(k: string, fallback: T): T => {
        try {
          const raw = localStorage.getItem(k);
          return raw ? JSON.parse(raw) : fallback;
        } catch {
          return fallback;
        }
      };
      cache.products = parseLS(KEYS.PRODUCTS, SEED_PRODUCTS);
      cache.customers = parseLS(KEYS.CUSTOMERS, SEED_CUSTOMERS);
      cache.invoices = parseLS(KEYS.INVOICES, []);
      cache.purchases = parseLS(KEYS.PURCHASES, []);
      cache.payments = parseLS(KEYS.PAYMENTS, []);
      cache.expenses = parseLS(KEYS.EXPENSES, []);
      cache.company = parseLS(KEYS.COMPANY, DEFAULT_COMPANY);
      cache.stockMovements = parseLS(KEYS.STOCK_MOVEMENTS, []);
      cache.stockEntries = parseLS(KEYS.STOCK_ENTRIES, []);
      cache.bankAccounts = parseLS(KEYS.BANK_ACCOUNTS, []);
      cache.accountTransactions = parseLS(KEYS.ACCOUNT_TXNS, []);
      cache.godowns = parseLS(KEYS.GODOWNS, []);
      cache.godownTransfers = parseLS(KEYS.GODOWN_TRANSFERS, []);
      cache.automatedBills = parseLS(KEYS.AUTOMATED_BILLS, []);
      cache.staffMembers = parseLS(KEYS.STAFF_MEMBERS, []);

      ensureDefaultAccountsAndGodowns();
      cache.isLoaded = true;
    } else {
      cache.products = [];
      cache.customers = [];
      cache.invoices = [];
      cache.purchases = [];
      cache.payments = [];
      cache.expenses = [];
      cache.stockMovements = [];
      cache.stockEntries = [];
      cache.bankAccounts = [];
      cache.accountTransactions = [];
      cache.godowns = [];
      cache.godownTransfers = [];
      cache.automatedBills = [];
      cache.staffMembers = [];
      cache.company = DEFAULT_COMPANY;
      ensureDefaultAccountsAndGodowns();
      cache.isLoaded = true;
    }
  },

  getCollectionPath: (col: string) => {
    if (cache.currentUserId) {
      const cid = cache.currentCompanyId;
      if (cid && cid !== 'default') {
        return `users/${cache.currentUserId}/companies/${cid}/${col}`;
      }
      return `users/${cache.currentUserId}/${col}`;
    }
    return col;
  },

  persistToLocalStorage: () => {
    if (!cache.currentUserId) {
      const KEYS = getKeys();
      localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(cache.products));
      localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(cache.customers));
      localStorage.setItem(KEYS.INVOICES, JSON.stringify(cache.invoices));
      localStorage.setItem(KEYS.PURCHASES, JSON.stringify(cache.purchases));
      localStorage.setItem(KEYS.PAYMENTS, JSON.stringify(cache.payments));
      localStorage.setItem(KEYS.EXPENSES, JSON.stringify(cache.expenses));
      localStorage.setItem(KEYS.STOCK_MOVEMENTS, JSON.stringify(cache.stockMovements));
      localStorage.setItem(KEYS.STOCK_ENTRIES, JSON.stringify(cache.stockEntries));
      localStorage.setItem(KEYS.BANK_ACCOUNTS, JSON.stringify(cache.bankAccounts));
      localStorage.setItem(KEYS.ACCOUNT_TXNS, JSON.stringify(cache.accountTransactions));
      localStorage.setItem(KEYS.GODOWNS, JSON.stringify(cache.godowns));
      localStorage.setItem(KEYS.GODOWN_TRANSFERS, JSON.stringify(cache.godownTransfers));
      localStorage.setItem(KEYS.AUTOMATED_BILLS, JSON.stringify(cache.automatedBills));
      localStorage.setItem(KEYS.STAFF_MEMBERS, JSON.stringify(cache.staffMembers));
      localStorage.setItem(KEYS.COMPANY, JSON.stringify(cache.company));
    }
  },

  // --- Getters ---
  getProducts: (): Product[] => [...cache.products],
  getCustomers: (): Customer[] => [...cache.customers],
  getInvoices: (includeDeleted = false): Invoice[] =>
    cache.invoices.filter(
      i => (includeDeleted || !i.isDeleted) && (!i.type || i.type === 'SALE' || i.type === 'CREDIT_NOTE')
    ),
  getPurchases: (includeDeleted = false): Invoice[] =>
    cache.purchases.filter(
      p => (includeDeleted || !p.isDeleted) && (!p.type || p.type === 'PURCHASE')
    ),
  getVouchersByType: (type: VoucherType, includeDeleted = false): Invoice[] => {
    const map = new Map<string, Invoice>();
    [...cache.invoices, ...cache.purchases].forEach(v => {
      if ((v.type || 'SALE') === type && (includeDeleted || !v.isDeleted)) {
        map.set(v.id, v);
      }
    });
    return Array.from(map.values());
  },
  getAllVouchers: (includeDeleted = false): Invoice[] => {
    const map = new Map<string, Invoice>();
    [...cache.invoices, ...cache.purchases].forEach(v => {
      if (includeDeleted || !v.isDeleted) map.set(v.id, v);
    });
    return Array.from(map.values());
  },
  getPayments: (includeDeleted = false): Payment[] =>
    cache.payments.filter(p => includeDeleted || !p.isDeleted),
  getExpenses: (includeDeleted = false): Expense[] =>
    cache.expenses.filter(e => includeDeleted || !e.isDeleted),
  getCompanyProfile: (): CompanyProfile => cache.company,
  getStockMovements: (): StockMovement[] => [...cache.stockMovements],
  getStockEntries: (): StockEntry[] => [...cache.stockEntries],
  getBankAccounts: (): BankAccount[] => [...cache.bankAccounts],
  getAccountTransactions: (): AccountTransaction[] => [...cache.accountTransactions],
  getGodowns: (): Godown[] => [...cache.godowns],
  getGodownTransfers: (): GodownTransfer[] => [...cache.godownTransfers],
  getAutomatedBills: (): AutomatedBill[] => [...cache.automatedBills],
  getStaffMembers: (): StaffMember[] => [...cache.staffMembers],

  /** Barcode lookup inside the current business scope. Archived/disabled rows are skipped. */
  findProductByBarcode: (barcode: string, opts?: { includeArchived?: boolean; includeDisabled?: boolean }): Product | null =>
    findProductByBarcodePure(cache.products, barcode, opts),

  /** Duplicate protection for the product master. */
  isBarcodeTaken: (barcode: string, excludeProductId?: string): Product | null =>
    isBarcodeTakenPure(cache.products, barcode, excludeProductId),

  /** Immutable stock history for one product, newest first. */
  getStockHistory: (productId: string): StockMovement[] =>
    cache.stockMovements
      .filter(m => m.productId === productId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),

  getMovementsByReference: (referenceId: string): StockMovement[] =>
    cache.stockMovements.filter(m => m.referenceId === referenceId),

  /** Ledger-derived stock (audit source of truth). */
  getLedgerStock: (productId: string): number => computeStockFromLedger(cache.stockMovements, productId),

  /** Compare products.stock against the ledger; non-empty means drift. */
  reconcileStock: () => reconcile(cache.products, cache.stockMovements),

  getFirebaseConfig: (): FirebaseConfig | null => {
    return DEFAULT_FIREBASE_CONFIG;
  },

  getContactPreference: (): 'ALL' | 'SELECTED' | 'NOT_SET' => {
    return (localStorage.getItem(getKeys().CONTACT_PREFERENCE) as any) || 'NOT_SET';
  },

  setContactPreference: (pref: 'ALL' | 'SELECTED') => {
    localStorage.setItem(getKeys().CONTACT_PREFERENCE, pref);
  },

  getPrivacyAccepted: (): boolean => {
    return localStorage.getItem(getKeys().PRIVACY_ACCEPTED) === 'true';
  },

  setPrivacyAccepted: (accepted: boolean) => {
    localStorage.setItem(getKeys().PRIVACY_ACCEPTED, String(accepted));
  },

  // --- Setters ---
  saveFirebaseConfig: (_config: FirebaseConfig) => {
    // No-op since we use hardcoded config, but keep for interface compatibility
    // No-op: We do not persist sensitive config to LocalStorage for security reasons.
    // Config is managed in code or via secure environment variables.
  },

  saveProduct: (product: Product) => {
    // Normalize the barcode once, at the single product write path:
    //  - blank -> undefined (never an empty string, so the unique index stays meaningful)
    //  - whitespace / control / zero-width characters stripped
    //  - leading zeros PRESERVED (the value is never coerced to a number)
    const normalizedBarcode = product.barcode ? normalizeBarcode(product.barcode) : '';
    const now = new Date().toISOString();
    const sanitized: Product = {
      ...product,
      barcode: normalizedBarcode || undefined,
      barcodeFormat: normalizedBarcode
        ? (product.barcodeFormat || detectBarcodeFormat(normalizedBarcode))
        : undefined,
      barcodeEnabled: product.barcodeEnabled !== false,
      createdAt: product.createdAt || now,
      updatedAt: now,
    };

    const index = cache.products.findIndex(p => p.id === sanitized.id);
    const newProducts = [...cache.products];
    if (index >= 0) newProducts[index] = sanitized;
    else newProducts.push(sanitized);
    cache.products = newProducts;

    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('products'), sanitized.id, sanitized);
  },

  updateProduct: (product: Product) => {
    StorageService.saveProduct(product); // Reuse save since it handles upsert
  },

  deleteProduct: (id: string) => {
    cache.products = cache.products.filter(p => p.id !== id);
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.deleteDocument(StorageService.getCollectionPath('products'), id);
  },

  /**
   * Archive instead of delete. Preferred whenever the product is referenced by an
   * invoice, so historical bills keep resolving their product.
   */
  archiveProduct: (id: string) => {
    const idx = cache.products.findIndex(p => p.id === id);
    if (idx < 0) return;
    const updated: Product = { ...cache.products[idx], isArchived: true, updatedAt: new Date().toISOString() };
    const newProducts = [...cache.products];
    newProducts[idx] = updated;
    cache.products = newProducts;
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('products'), updated.id, updated);
  },

  /**
   * THE single entry point for every stock change.
   * Writes the product row and its immutable ledger row together, and refuses to
   * apply the same idempotency key twice.
   */
  applyStockMovement: (
    input: MovementInput & { allowNegative?: boolean }
  ): { ok: boolean; error?: string; movement?: StockMovement; product?: Product } => {
    const idx = cache.products.findIndex(p => p.id === input.productId);
    if (idx < 0) return { ok: false, error: 'Product nahi mila.' };

    if (input.idempotencyKey && hasIdempotencyKey(cache.stockMovements, input.idempotencyKey)) {
      return { ok: false, error: 'Ye stock entry pehle hi save ho chuki hai.' };
    }

    const product = cache.products[idx];
    const movement = buildMovement(
      {
        ...input,
        stockBefore: Number(product.stock || 0),
        barcodeSnapshot: input.barcodeSnapshot ?? product.barcode,
      },
      StorageService.getUserId() || undefined
    );

    const err = validateMovement(movement, input.allowNegative === true);
    if (err) return { ok: false, error: err };

    const updatedProduct = applyDeltaToProduct(product, movement.quantityDelta);
    const newProducts = [...cache.products];
    newProducts[idx] = updatedProduct;
    cache.products = newProducts;
    cache.stockMovements = [movement, ...cache.stockMovements];

    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) {
      FirebaseService.saveDocument(StorageService.getCollectionPath('products'), updatedProduct.id, updatedProduct);
      FirebaseService.saveDocument(StorageService.getCollectionPath('stock_movements'), movement.id, movement);
    }
    return { ok: true, movement, product: updatedProduct };
  },

  /**
   * Commit a multi-scan stock-in session (header + lines + one STOCK_IN movement per line).
   * Validates every line against a working copy first, so a bad line can never leave
   * the session half-applied.
   */
  saveStockEntry: (
    entry: Omit<StockEntry, 'entryNumber' | 'totalItems' | 'totalQuantity' | 'totalValue'> & {
      entryNumber?: string;
    }
  ): { ok: boolean; error?: string; entry?: StockEntry } => {
    if (!entry.items || entry.items.length === 0) return { ok: false, error: 'Koi item nahi hai.' };

    const idempotencyKey = `stock_entry:${entry.id}`;
    if (hasIdempotencyKey(cache.stockMovements, idempotencyKey)) {
      return { ok: false, error: 'Ye stock entry pehle hi save ho chuki hai.' };
    }

    const working = [...cache.products];
    const movements: StockMovement[] = [];

    for (const line of entry.items) {
      const idx = working.findIndex(p => p.id === line.productId);
      if (idx < 0) return { ok: false, error: `Product nahi mila: ${line.productNameSnapshot}` };

      const product = working[idx];
      const movement = buildMovement(
        {
          productId: line.productId,
          barcodeSnapshot: line.barcodeSnapshot ?? product.barcode,
          movementType: 'STOCK_IN',
          quantityDelta: line.quantity,
          stockBefore: Number(product.stock || 0),
          unitCost: line.unitCost,
          referenceType: 'PURCHASE',
          referenceId: entry.id,
          idempotencyKey,
        },
        StorageService.getUserId() || undefined
      );

      const err = validateMovement(movement);
      if (err) return { ok: false, error: `${line.productNameSnapshot}: ${err}` };

      working[idx] = applyDeltaToProduct(
        product,
        movement.quantityDelta,
        line.unitCost ? { purchasePrice: line.unitCost } : {}
      );
      movements.push(movement);
    }

    const totals = entry.items.reduce(
      (acc, l) => {
        acc.qty += Number(l.quantity) || 0;
        acc.val += Number(l.lineTotal ?? (Number(l.quantity) || 0) * (Number(l.unitCost) || 0)) || 0;
        return acc;
      },
      { qty: 0, val: 0 }
    );

    const fullEntry: StockEntry = {
      ...entry,
      entryNumber: entry.entryNumber || nextEntryNumber(cache.stockEntries),
      status: 'COMPLETED',
      totalItems: entry.items.length,
      totalQuantity: totals.qty,
      totalValue: totals.val,
      completedAt: new Date().toISOString(),
    };

    cache.products = working;
    cache.stockMovements = [...movements, ...cache.stockMovements];
    cache.stockEntries = [fullEntry, ...cache.stockEntries];

    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) {
      const touched = new Set(movements.map(m => m.productId));
      working.forEach(prod => {
        if (touched.has(prod.id)) {
          FirebaseService.saveDocument(StorageService.getCollectionPath('products'), prod.id, prod);
        }
      });
      movements.forEach(m =>
        FirebaseService.saveDocument(StorageService.getCollectionPath('stock_movements'), m.id, m)
      );
      FirebaseService.saveDocument(StorageService.getCollectionPath('stock_entries'), fullEntry.id, fullEntry);
    }
    return { ok: true, entry: fullEntry };
  },

  /**
   * Append-only scan analytics. The raw barcode is NEVER stored here (hashed only).
   * Written under the same users/{uid}/ scope as products/invoices so it inherits
   * identical security-rule behaviour instead of relying on a top-level collection.
   */
  logBarcodeScan: (event: Omit<BarcodeScanEvent, 'id' | 'createdAt'>): BarcodeScanEvent => {
    const full: BarcodeScanEvent = { ...event, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    if (FirebaseService.isReady()) {
      FirebaseService.saveDocument(StorageService.getCollectionPath('barcode_scan_events'), full.id, full);
    }
    return full;
  },

  saveCustomer: (customer: Customer) => {
    const index = cache.customers.findIndex(c => c.id === customer.id);
    const newCustomers = [...cache.customers];
    if (index >= 0) newCustomers[index] = customer;
    else newCustomers.push(customer);
    cache.customers = newCustomers;

    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), customer.id, customer);
  },

  addNotification: (customerId: string, notification: Omit<CustomerNotification, 'id' | 'read'>) => {
    const index = cache.customers.findIndex(c => c.id === customerId);
    if (index >= 0) {
      const newNotification: CustomerNotification = {
        id: crypto.randomUUID(),
        read: false,
        ...notification
      };
      const customerToUpdate = { ...cache.customers[index] }; // Create a new customer object
      if (!customerToUpdate.notifications) customerToUpdate.notifications = [];
      customerToUpdate.notifications = [newNotification, ...customerToUpdate.notifications]; // Create a new notifications array

      const newCustomers = [...cache.customers]; // Create a new customers array
      newCustomers[index] = customerToUpdate;
      cache.customers = newCustomers; // Update cache with the new array

      StorageService.persistToLocalStorage();
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), customerId, cache.customers[index]);
    }
  },

  saveInvoice: (invoice: Invoice) => {
    const invoiceKey = invoice.saveIdempotencyKey || `invoice:${invoice.id}`;
    const alreadySaved = cache.invoices.some(i => i.id === invoice.id && !i.isDeleted);
    if (alreadySaved || (!invoice.stockDeducted && hasIdempotencyKey(cache.stockMovements, invoiceKey))) {
      return { ok: false, error: 'Ye entry pehle hi save ho chuki hai.' };
    }

    const workingProducts = [...cache.products];
    const movements: StockMovement[] = [];
    const warnings: string[] = [];

    if (!invoice.stockDeducted) {
      invoice.items.forEach(item => {
        const pIndex = workingProducts.findIndex(p => p.id === item.productId);
        if (pIndex < 0) return;
        if (workingProducts[pIndex].category === 'Services') return;

        const product = workingProducts[pIndex];
        const qty = Math.abs(Number(item.quantity) || 0);
        if (qty === 0) return;

        const movement = buildMovement(
          {
            productId: product.id,
            barcodeSnapshot: item.barcodeSnapshot ?? product.barcode,
            movementType: 'SALE',
            quantityDelta: -qty,
            stockBefore: Number(product.stock || 0),
            referenceType: 'INVOICE',
            referenceId: invoice.id,
            idempotencyKey: invoiceKey,
          },
          StorageService.getUserId() || undefined
        );

        if (qty > Number(product.stock || 0)) {
          warnings.push(`${product.name}: available stock ${product.stock} tha, ${qty} becha gaya.`);
        }

        const err = validateMovement(movement, true);
        if (err) {
          warnings.push(`${product.name}: ${err}`);
          return;
        }

        const godownPatch: Partial<Product> = {};
        if (invoice.godownId && product.godownStocks) {
          const cur = Number(product.godownStocks[invoice.godownId] ?? product.stock ?? 0);
          godownPatch.godownStocks = { ...product.godownStocks, [invoice.godownId]: cur - qty };
        }
        workingProducts[pIndex] = applyDeltaToProduct(product, movement.quantityDelta, godownPatch);
        movements.push(movement);
      });

      cache.products = workingProducts;
      cache.stockMovements = [...movements, ...cache.stockMovements];
      if (FirebaseService.isReady()) {
        const touched = new Set(movements.map(m => m.productId));
        workingProducts.forEach(prod => {
          if (touched.has(prod.id)) {
            FirebaseService.saveDocument(StorageService.getCollectionPath('products'), prod.id, prod);
          }
        });
        movements.forEach(m =>
          FirebaseService.saveDocument(StorageService.getCollectionPath('stock_movements'), m.id, m)
        );
      }
      invoice.stockDeducted = true;
      invoice.stockDeductedAt = new Date().toISOString();
    }

    invoice.type = invoice.type || 'SALE';
    invoice.saveIdempotencyKey = invoiceKey;
    invoice.publicToken = invoice.publicToken || crypto.randomUUID();
    const paidNow = invoice.status === 'PAID'
      ? invoice.total
      : Number(invoice.amountReceived ?? invoice.paidAmount ?? 0);
    invoice.paidAmount = paidNow;
    invoice.balanceDue = Math.max(0, Math.round((invoice.total - paidNow) * 100) / 100);

    const dueDelta = invoice.status === 'PAID' ? 0 : Math.max(0, invoice.total - paidNow);
    const newCustomers = [...cache.customers];
    const cIndex = newCustomers.findIndex(c => c.id === invoice.customerId);
    if (cIndex >= 0 && dueDelta > 0) {
      const customer = { ...newCustomers[cIndex] };
      customer.balance += dueDelta;
      newCustomers[cIndex] = customer;
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), customer.id, customer);
    }
    cache.customers = newCustomers;

    // Credit cash/bank account if paid on invoice
    if (paidNow > 0 && !invoice.convertedFromId) {
      const targetAccId = invoice.accountId || (invoice.paymentMode === 'CASH' ? 'cash_default' : 'bank_default');
      StorageService._creditOrDebitAccount(targetAccId, paidNow, 'CASH_SALE', invoice.date, invoice.id, invoice.customerName, `Sale #${invoice.invoiceNumber}`);
    }

    cache.invoices = [invoice, ...cache.invoices.filter(i => i.id !== invoice.id)];

    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) {
      FirebaseService.saveDocument(StorageService.getCollectionPath('invoices'), invoice.id, invoice);

      FirebaseService.saveDocument('publicBills', invoice.id, {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        customerAddress: invoice.customerAddress,
        customerGstin: invoice.customerGstin,
        date: invoice.date,
        items: invoice.items,
        subtotal: invoice.subtotal,
        total: invoice.total,
        totalCgst: invoice.totalCgst || 0,
        totalSgst: invoice.totalSgst || 0,
        totalIgst: invoice.totalIgst || 0,
        gstEnabled: invoice.gstEnabled,
        status: invoice.status,
        notes: invoice.notes,
        _company: {
          name: cache.company.name,
          address: cache.company.address,
          phone: cache.company.phone,
          gstin: cache.company.gstin || cache.company.gst,
          upiId: cache.company.upiId
        },
        publicToken: invoice.publicToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });
    }

    StorageService.addNotification(invoice.customerId, {
      type: 'INVOICE',
      title: 'New Invoice Generated',
      message: `Invoice #${invoice.invoiceNumber} for ₹${invoice.total} has been created.`,
      date: new Date().toISOString().split('T')[0]
    });

    return { ok: true, movements, warnings };
  },

  saveCreditNote: (invoice: Invoice) => {
    invoice.type = 'CREDIT_NOTE';
    invoice.publicToken = invoice.publicToken || crypto.randomUUID();

    const creditKey = invoice.saveIdempotencyKey || `credit_note:${invoice.id}`;
    if (
      cache.invoices.some(i => i.id === invoice.id && !i.isDeleted) ||
      hasIdempotencyKey(cache.stockMovements, creditKey)
    ) {
      return { ok: false, error: 'Ye credit note pehle hi save ho chuki hai.' };
    }

    const workingProducts = [...cache.products];
    const returnMovements: StockMovement[] = [];

    invoice.items.forEach(item => {
      const pIndex = workingProducts.findIndex(p => p.id === item.productId);
      if (pIndex < 0) return;
      if (workingProducts[pIndex].category === 'Services') return;

      const product = workingProducts[pIndex];
      const qty = Math.abs(Number(item.quantity) || 0);
      if (qty === 0) return;

      const movement = buildMovement(
        {
          productId: product.id,
          barcodeSnapshot: item.barcodeSnapshot ?? product.barcode,
          movementType: 'SALE_RETURN',
          quantityDelta: qty,
          stockBefore: Number(product.stock || 0),
          referenceType: 'CREDIT_NOTE',
          referenceId: invoice.id,
          idempotencyKey: creditKey,
        },
        StorageService.getUserId() || undefined
      );

      const err = validateMovement(movement);
      if (err) return;

      workingProducts[pIndex] = applyDeltaToProduct(product, movement.quantityDelta);
      returnMovements.push(movement);
    });

    cache.products = workingProducts;
    cache.stockMovements = [...returnMovements, ...cache.stockMovements];
    invoice.stockDeducted = false;
    invoice.saveIdempotencyKey = creditKey;

    if (FirebaseService.isReady()) {
      const touched = new Set(returnMovements.map(m => m.productId));
      workingProducts.forEach(prod => {
        if (touched.has(prod.id)) {
          FirebaseService.saveDocument(StorageService.getCollectionPath('products'), prod.id, prod);
        }
      });
      returnMovements.forEach(m =>
        FirebaseService.saveDocument(StorageService.getCollectionPath('stock_movements'), m.id, m)
      );
    }

    const newCustomers = [...cache.customers];
    const cIndex = newCustomers.findIndex(c => c.id === invoice.customerId);
    if (cIndex >= 0 && invoice.status === 'PENDING') {
      const customer = { ...newCustomers[cIndex] };
      customer.balance -= invoice.total;
      newCustomers[cIndex] = customer;
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), customer.id, customer);
    }
    cache.customers = newCustomers;

    cache.invoices = [invoice, ...cache.invoices.filter(i => i.id !== invoice.id)];

    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) {
      FirebaseService.saveDocument(StorageService.getCollectionPath('invoices'), invoice.id, invoice);

      FirebaseService.saveDocument('publicBills', invoice.id, {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        customerAddress: invoice.customerAddress,
        customerGstin: invoice.customerGstin,
        date: invoice.date,
        items: invoice.items,
        subtotal: invoice.subtotal,
        total: invoice.total,
        totalCgst: invoice.totalCgst || 0,
        totalSgst: invoice.totalSgst || 0,
        totalIgst: invoice.totalIgst || 0,
        gstEnabled: invoice.gstEnabled,
        status: invoice.status,
        type: 'CREDIT_NOTE',
        notes: invoice.notes,
        _company: {
          name: cache.company.name,
          address: cache.company.address,
          phone: cache.company.phone,
          gstin: cache.company.gstin || cache.company.gst,
          upiId: cache.company.upiId
        },
        publicToken: invoice.publicToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });
    }

    StorageService.addNotification(invoice.customerId, {
      type: 'INVOICE',
      title: 'Credit Note Created',
      message: `Credit Note #${invoice.invoiceNumber} for ₹${invoice.total} has been credited to your account.`,
      date: new Date().toISOString().split('T')[0]
    });

    return { ok: true, movements: returnMovements };
  },

  savePayment: (payment: Payment) => {
    if (!Number.isFinite(payment.amount) || payment.amount <= 0 || cache.payments.some(item => item.id === payment.id)) return;
    const enriched: Payment = { ...payment, accountId: paymentAccount(payment), amount: roundCurrency(payment.amount) };
    if (enriched.amount <= 0) return;
    if (enriched.isDeleted) {
      storePayment(enriched, -1);
      return;
    }
    enriched.allocations = applyPaymentToBillsAndParty(enriched, false);
    applyPaymentToAccount(enriched, false);
    storePayment(enriched, -1);

    const outgoing = enriched.type === 'PAID';
    StorageService.addNotification(enriched.customerId, {
      type: 'PAYMENT',
      title: outgoing ? 'Payment Made' : 'Payment Received',
      message: `Payment of ₹${enriched.amount} ${outgoing ? 'paid' : 'received'} via ${enriched.mode}.`,
      date: enriched.date,
    });
  },

  updatePayment: (updatedPayment: Payment) => {
    const index = cache.payments.findIndex(payment => payment.id === updatedPayment.id && !payment.isDeleted);
    const amount = roundCurrency(updatedPayment.amount);
    if (index < 0 || !Number.isFinite(amount) || amount <= 0) return;

    const previous = cache.payments[index];
    const next: Payment = { ...updatedPayment, amount, accountId: paymentAccount(updatedPayment) };
    const directionChanged = (previous.type === 'PAID') !== (next.type === 'PAID');
    const changedAmount = previous.amount !== next.amount;
    const changedParty = previous.customerId !== next.customerId;
    if (changedAmount || changedParty || directionChanged ||
        JSON.stringify(getPaymentAllocations(previous)) !== JSON.stringify(getPaymentAllocations(next))) {
      applyPaymentToBillsAndParty(previous, true);
      next.allocations = applyPaymentToBillsAndParty(next, false);
    }

    if (changedAmount || changedParty || directionChanged || previous.date !== next.date ||
        paymentAccount(previous) !== paymentAccount(next) || postsToAccount(previous) !== postsToAccount(next)) {
      applyPaymentToAccount(previous, true);
      applyPaymentToAccount(next, false);
    }
    storePayment(next, index);
  },

  deletePayment: (paymentId: string) => {
    const index = cache.payments.findIndex(payment => payment.id === paymentId && !payment.isDeleted);
    if (index < 0) return;
    const payment = cache.payments[index];
    applyPaymentToBillsAndParty(payment, true);
    applyPaymentToAccount(payment, true);
    storePayment({
      ...payment, isDeleted: true, deletedAt: new Date().toISOString(), settlementReversedOnDelete: true,
    }, index);
  },


  deleteInvoice: (invoiceId: string) => {
    const index = cache.invoices.findIndex(i => i.id === invoiceId);
    if (index === -1) return;
    const invoice = cache.invoices[index];
    if (invoice.isDeleted) return;
    const vType = invoice.type || 'SALE';
    const isCreditNote = vType === 'CREDIT_NOTE';
    const affectsStock = vType === 'SALE' || vType === 'CREDIT_NOTE' || vType === 'DELIVERY_CHALLAN';
    const affectsBalance = vType === 'SALE' || vType === 'CREDIT_NOTE';

    if (affectsStock) {
      invoice.items.forEach(item => {
        const pIndex = cache.products.findIndex(p => p.id === item.productId);
        if (pIndex >= 0 && cache.products[pIndex].category !== 'Services') {
          const product = cache.products[pIndex];
          if (isCreditNote) product.stock -= item.quantity;
          else product.stock += item.quantity;
          if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('products'), product.id, product);
        }
      });
    }

    const cIndex = cache.customers.findIndex(c => c.id === invoice.customerId);
    if (affectsBalance && cIndex >= 0 && invoice.status !== 'PAID') {
      const customer = cache.customers[cIndex];
      const unpaid = Math.max(0, invoice.total - Number(invoice.paidAmount ?? invoice.amountReceived ?? 0));
      if (isCreditNote) customer.balance += unpaid;
      else customer.balance -= unpaid;
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), customer.id, customer);
    }

    cache.invoices[index] = { ...invoice, isDeleted: true, deletedAt: new Date().toISOString() };
    StorageService.persistToLocalStorage();

    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('invoices'), invoice.id, cache.invoices[index]);
  },

  // --- Purchase Logic ---
  savePurchase: (purchase: Invoice) => {
    purchase.type = purchase.type || 'PURCHASE';
    const newProducts = [...cache.products];

    purchase.items.forEach(item => {
      const pIndex = newProducts.findIndex(p => p.id === item.productId);
      if (pIndex >= 0) {
        const product = { ...newProducts[pIndex] };

        if (product.category !== 'Services') {
          product.stock += item.quantity;
        }

        if (item.rate > 0) product.purchasePrice = item.rate;

        if (purchase.gstEnabled && item.gstRate !== undefined && item.gstRate > 0) {
          product.gstRate = item.gstRate;
        }

        newProducts[pIndex] = product;
        if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('products'), product.id, product);
      }
    });
    cache.products = newProducts;

    const newCustomers = [...cache.customers];
    const cIndex = newCustomers.findIndex(c => c.id === purchase.customerId);
    const paidAmt = purchase.status === 'PAID' ? purchase.total : Number(purchase.paidAmount ?? purchase.amountReceived ?? 0);
    const unpaid = Math.max(0, purchase.total - paidAmt);
    if (cIndex >= 0 && unpaid > 0) {
      const vendor = { ...newCustomers[cIndex] };
      vendor.balance -= unpaid;
      vendor.type = vendor.type === 'CUSTOMER' ? 'BOTH' : (vendor.type || 'VENDOR');
      newCustomers[cIndex] = vendor;
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), vendor.id, vendor);
    }
    cache.customers = newCustomers;

    if (paidAmt > 0) {
      const accId = purchase.accountId || (purchase.paymentMode === 'CASH' ? 'cash_default' : 'bank_default');
      StorageService._creditOrDebitAccount(accId, -paidAmt, 'PAYMENT', purchase.date, purchase.id, purchase.customerName, `Purchase #${purchase.invoiceNumber}`);
    }

    cache.purchases = [purchase, ...cache.purchases.filter(p => p.id !== purchase.id)];

    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) {
      FirebaseService.saveDocument(StorageService.getCollectionPath('purchases'), purchase.id, purchase);
    }
  },

  deletePurchase: (purchaseId: string) => {
    const index = cache.purchases.findIndex(p => p.id === purchaseId);
    if (index === -1) return;
    const purchase = cache.purchases[index];
    if (purchase.isDeleted) return;
    const vType = purchase.type || 'PURCHASE';

    if (vType === 'PURCHASE' || vType === 'DEBIT_NOTE') {
      purchase.items.forEach(item => {
        const pIndex = cache.products.findIndex(p => p.id === item.productId);
        if (pIndex >= 0 && cache.products[pIndex].category !== 'Services') {
          if (vType === 'DEBIT_NOTE') cache.products[pIndex].stock += item.quantity;
          else cache.products[pIndex].stock -= item.quantity;
          if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('products'), cache.products[pIndex].id, cache.products[pIndex]);
        }
      });

      const cIndex = cache.customers.findIndex(c => c.id === purchase.customerId);
      if (cIndex >= 0 && purchase.status !== 'PAID') {
        const unpaid = Math.max(0, purchase.total - Number(purchase.paidAmount ?? purchase.amountReceived ?? 0));
        if (vType === 'DEBIT_NOTE') cache.customers[cIndex].balance -= unpaid;
        else cache.customers[cIndex].balance += unpaid;
        if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), cache.customers[cIndex].id, cache.customers[cIndex]);
      }
    }

    cache.purchases[index] = { ...purchase, isDeleted: true, deletedAt: new Date().toISOString() };
    StorageService.persistToLocalStorage();

    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('purchases'), purchase.id, cache.purchases[index]);
  },

  updatePurchase: (updatedPurchase: Invoice) => {
    // Simplistic approach: delete old, save new. 
    // This is safer for complex stock/balance logic than diffing manually, though slightly less efficient.
    // But we need to keep the ID same.
    const oldIndex = cache.purchases.findIndex(p => p.id === updatedPurchase.id);
    if (oldIndex === -1) return;

    const oldPurchase = cache.purchases[oldIndex];

    // 1. Revert Old Stock
    oldPurchase.items.forEach(item => {
      const pIndex = cache.products.findIndex(p => p.id === item.productId);
      if (pIndex >= 0 && cache.products[pIndex].category !== 'Services') {
        cache.products[pIndex].stock -= item.quantity;
      }
    });
    // 2. Revert Old Balance
    const oldCIndex = cache.customers.findIndex(c => c.id === oldPurchase.customerId);
    const oldPaid = oldPurchase.status === 'PAID' ? oldPurchase.total : Number(oldPurchase.paidAmount ?? oldPurchase.amountReceived ?? 0);
    if (oldCIndex >= 0) {
      cache.customers[oldCIndex].balance += Math.max(0, oldPurchase.total - oldPaid);
    }

    // 3. Apply New Stock
    updatedPurchase.items.forEach(item => {
      const pIndex = cache.products.findIndex(p => p.id === item.productId);
      if (pIndex >= 0 && cache.products[pIndex].category !== 'Services') {
        cache.products[pIndex].stock += item.quantity;
        // Update Cost Price again? Yes
        if (item.rate > 0) cache.products[pIndex].purchasePrice = item.rate;
      }
    });
    // 4. Apply New Balance
    const newCIndex = cache.customers.findIndex(c => c.id === updatedPurchase.customerId);
    const newPaid = updatedPurchase.status === 'PAID' ? updatedPurchase.total : Number(updatedPurchase.paidAmount ?? updatedPurchase.amountReceived ?? 0);
    if (newCIndex >= 0) {
      cache.customers[newCIndex].balance -= Math.max(0, updatedPurchase.total - newPaid);
    }

    // Save changes to Collections

    // Update Products
    if (FirebaseService.isReady()) {
      // Saving all products might be too much, but needed if we touched multiple. 
      // Optimization: only save modified products.
      const affectedProductIds = new Set([...oldPurchase.items, ...updatedPurchase.items].map(i => i.productId));
      affectedProductIds.forEach(pid => {
        const p = cache.products.find(prod => prod.id === pid);
        if (p) FirebaseService.saveDocument(StorageService.getCollectionPath('products'), p.id, p);
      });

      const oldC = cache.customers[oldCIndex];
      if (oldC) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), oldC.id, oldC);

      if (oldCIndex !== newCIndex) {
        const newC = cache.customers[newCIndex];
        if (newC) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), newC.id, newC);
      }
    }

    cache.purchases[oldIndex] = updatedPurchase;
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('purchases'), updatedPurchase.id, updatedPurchase);
  },

  updateInvoice: (updatedInvoice: Invoice) => {
    const oldInvoiceIndex = cache.invoices.findIndex(i => i.id === updatedInvoice.id);
    if (oldInvoiceIndex === -1) return;
    const oldInvoice = cache.invoices[oldInvoiceIndex];

    const modifiedProductIds = new Set<string>();
    const oldIsCreditNote = oldInvoice.type === 'CREDIT_NOTE';
    const newIsCreditNote = updatedInvoice.type === 'CREDIT_NOTE';

    // 1. Revert Old Logic
    oldInvoice.items.forEach(item => {
      const pIndex = cache.products.findIndex(p => p.id === item.productId);
      if (pIndex >= 0 && cache.products[pIndex].category !== 'Services') {
        if (oldIsCreditNote) {
          cache.products[pIndex].stock -= item.quantity;
        } else {
          cache.products[pIndex].stock += item.quantity;
        }
        modifiedProductIds.add(cache.products[pIndex].id);
      }
    });

    const oldCIndex = cache.customers.findIndex(c => c.id === oldInvoice.customerId);
    if (oldCIndex >= 0 && oldInvoice.status === 'PENDING') {
      if (oldIsCreditNote) {
        cache.customers[oldCIndex].balance += oldInvoice.total;
      } else {
        cache.customers[oldCIndex].balance -= oldInvoice.total;
      }
    }

    // 2. Apply New Logic
    updatedInvoice.items.forEach(item => {
      const pIndex = cache.products.findIndex(p => p.id === item.productId);
      if (pIndex >= 0 && cache.products[pIndex].category !== 'Services') {
        if (newIsCreditNote) {
          cache.products[pIndex].stock += item.quantity;
        } else {
          cache.products[pIndex].stock -= item.quantity;
        }
        modifiedProductIds.add(cache.products[pIndex].id);
      }
    });

    const newCIndex = cache.customers.findIndex(c => c.id === updatedInvoice.customerId);
    if (newCIndex >= 0 && updatedInvoice.status === 'PENDING') {
      if (newIsCreditNote) {
        cache.customers[newCIndex].balance -= updatedInvoice.total;
      } else {
        cache.customers[newCIndex].balance += updatedInvoice.total;
      }
    }

    if (FirebaseService.isReady()) {
      modifiedProductIds.forEach(pid => {
        const product = cache.products.find(p => p.id === pid);
        if (product) FirebaseService.saveDocument(StorageService.getCollectionPath('products'), product.id, product);
      });

      const oldC = cache.customers[oldCIndex];
      if (oldC) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), oldC.id, oldC);

      if (oldCIndex !== newCIndex) {
        const newC = cache.customers[newCIndex];
        if (newC) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), newC.id, newC);
      }
    }

    updatedInvoice.publicToken = updatedInvoice.publicToken || oldInvoice.publicToken || crypto.randomUUID();
    cache.invoices[oldInvoiceIndex] = updatedInvoice;

    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) {
      FirebaseService.saveDocument(StorageService.getCollectionPath('invoices'), updatedInvoice.id, updatedInvoice);

      FirebaseService.saveDocument('publicBills', updatedInvoice.id, {
        id: updatedInvoice.id,
        invoiceNumber: updatedInvoice.invoiceNumber,
        customerName: updatedInvoice.customerName,
        customerAddress: updatedInvoice.customerAddress,
        customerGstin: updatedInvoice.customerGstin,
        date: updatedInvoice.date,
        items: updatedInvoice.items,
        subtotal: updatedInvoice.subtotal,
        total: updatedInvoice.total,
        totalCgst: updatedInvoice.totalCgst || 0,
        totalSgst: updatedInvoice.totalSgst || 0,
        totalIgst: updatedInvoice.totalIgst || 0,
        gstEnabled: updatedInvoice.gstEnabled,
        status: updatedInvoice.status,
        notes: updatedInvoice.notes,
        _company: {
          name: cache.company.name,
          address: cache.company.address,
          phone: cache.company.phone,
          gstin: cache.company.gstin || cache.company.gst,
          upiId: cache.company.upiId
        },
        publicToken: updatedInvoice.publicToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });
    }

    if (oldInvoice.total !== updatedInvoice.total) {
      StorageService.addNotification(updatedInvoice.customerId, {
        type: 'INVOICE',
        title: 'Invoice Updated',
        message: `Invoice #${updatedInvoice.invoiceNumber} has been updated to ₹${updatedInvoice.total}.`,
        date: new Date().toISOString().split('T')[0]
      });
    }
  },

  saveCompanyProfile: (profile: CompanyProfile) => {
    cache.company = profile;
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('company'), 'profile', profile);
  },

  getLastSalePrice: (customerId: string, productId: string): number | null => {
    const customerInvoices = cache.invoices.filter(inv => inv.customerId === customerId);
    for (const inv of customerInvoices) {
      const item = inv.items.find(i => i.productId === productId);
      if (item) return item.rate;
    }
    return null;
  },

  getCustomerBehaviorScore: (customerId: string): number => {
    const invoices = cache.invoices.filter(i => i.customerId === customerId);
    if (invoices.length === 0) return 100;

    const totalInvoiced = invoices.reduce((sum, i) => sum + i.total, 0);
    const totalPaid = cache.payments
      .filter(p => p.customerId === customerId)
      .reduce((sum, p) => sum + p.amount, 0) +
      invoices.filter(i => i.status === 'PAID').reduce((sum, i) => sum + i.total, 0);

    if (totalInvoiced === 0) return 100;
    const score = (totalPaid / totalInvoiced) * 100;
    return Math.min(Math.round(score), 100);
  },

  predictNextItem: (customerId: string): Product | null => {
    if (!customerId) return null;
    const customerInvoices = cache.invoices.filter(inv => inv.customerId === customerId);
    if (customerInvoices.length === 0) {
      // Return most popular product overall
      const productCounts: Record<string, number> = {};
      cache.invoices.forEach(inv => {
        inv.items.forEach(item => {
          productCounts[item.productId] = (productCounts[item.productId] || 0) + 1;
        });
      });
      const topProductId = Object.keys(productCounts).sort((a, b) => productCounts[b] - productCounts[a])[0];
      return topProductId ? cache.products.find(p => p.id === topProductId) || null : null;
    }

    const counts: Record<string, number> = {};
    customerInvoices.forEach(inv => {
      inv.items.forEach(item => {
        counts[item.productId] = (counts[item.productId] || 0) + 1;
      });
    });

    const bestId = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    return bestId ? cache.products.find(p => p.id === bestId) || null : null;
  },

  updateCustomer: (customer: Customer) => {
    const index = cache.customers.findIndex(c => c.id === customer.id);
    if (index >= 0) {
      cache.customers[index] = customer;
      StorageService.persistToLocalStorage();
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), customer.id, customer);
    }
  },

  deleteCustomer: (customerId: string) => {
    const index = cache.customers.findIndex(c => c.id === customerId);
    if (index >= 0) {
      cache.customers.splice(index, 1);
      StorageService.persistToLocalStorage();
      if (FirebaseService.isReady()) FirebaseService.deleteDocument(StorageService.getCollectionPath('customers'), customerId);
    }
  },

  saveExpense: (expense: Expense) => {
    const accId = expense.accountId || (expense.paymentMode === 'CASH' ? 'cash_default' : 'bank_default');
    const enriched: Expense = { ...expense, accountId: accId };
    const index = cache.expenses.findIndex(e => e.id === enriched.id);
    if (index >= 0) {
      const prev = cache.expenses[index];
      const delta = prev.amount - enriched.amount;
      if (delta !== 0) {
        StorageService._creditOrDebitAccount(accId, delta, 'EXPENSE', enriched.date, enriched.id, enriched.vendorName, `Updated Expense: ${enriched.category}`);
      }
      cache.expenses[index] = enriched;
    } else {
      cache.expenses.unshift(enriched);
      StorageService._creditOrDebitAccount(accId, -enriched.amount, 'EXPENSE', enriched.date, enriched.id, enriched.vendorName, `${enriched.category}${enriched.description ? ` - ${enriched.description}` : ''}`);
    }

    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('expenses'), enriched.id, enriched);
  },

  deleteExpense: (expenseId: string) => {
    const index = cache.expenses.findIndex(e => e.id === expenseId);
    if (index >= 0) {
      const exp = cache.expenses[index];
      if (exp.isDeleted) return;
      const accId = exp.accountId || (exp.paymentMode === 'CASH' ? 'cash_default' : 'bank_default');
      StorageService._creditOrDebitAccount(accId, exp.amount, 'ADD_MONEY', new Date().toISOString().split('T')[0], exp.id, exp.vendorName, `Reversal: deleted expense ${exp.category}`);
      cache.expenses[index] = { ...exp, isDeleted: true, deletedAt: new Date().toISOString() };
      StorageService.persistToLocalStorage();
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('expenses'), expenseId, cache.expenses[index]);
    }
  },

  generateVoucherNumber: (voucherType: VoucherType = 'SALE', dateStr?: string, customerId?: string): string => {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const safeDate = Number.isNaN(targetDate.getTime()) ? new Date() : targetDate;
    const fyStartYear = safeDate.getMonth() < 3 ? safeDate.getFullYear() - 1 : safeDate.getFullYear();
    const fyEndShort = String((fyStartYear + 1) % 100).padStart(2, '0');
    const fyShort = `${String(fyStartYear % 100).padStart(2, '0')}-${fyEndShort}`;

    const defaultPrefixes: Record<VoucherType, string> = {
      SALE: 'INV',
      PURCHASE: 'PUR',
      CREDIT_NOTE: 'CN',
      QUOTATION: 'QTN',
      PROFORMA: 'PI',
      DELIVERY_CHALLAN: 'DC',
      DEBIT_NOTE: 'DN',
      PURCHASE_ORDER: 'PO',
    };

    const cfg = cache.company.prefixConfig;
    const prefix = (cfg?.useCustomPrefix && cfg.prefixes?.[voucherType]) || defaultPrefixes[voucherType] || 'DOC';
    const label = (cfg?.useCustomPrefix && cfg.fyLabel) || fyShort;

    const existing = StorageService.getAllVouchers(true).filter(v => (v.type || 'SALE') === voucherType);
    let maxSeq = 0;
    existing.forEach(v => {
      const match = String(v.invoiceNumber || '').match(/(\d+)\s*$/);
      if (match) maxSeq = Math.max(maxSeq, Number(match[1]) || 0);
    });
    const configuredSeq = (cfg?.sequences?.[voucherType] || 1) - 1;
    const nextSeq = Math.max(maxSeq, configuredSeq, existing.length) + 1;

    if (customerId && voucherType === 'SALE' && cfg?.useCustomPrefix === false) {
      const customer = cache.customers.find(c => c.id === customerId);
      if (customer) {
        const custPrefix = customer.name.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'INV';
        return `${custPrefix}/${label}/${String(nextSeq).padStart(3, '0')}`;
      }
    }

    return `${prefix}/${label}/${String(nextSeq).padStart(3, '0')}`;
  },

  generateInvoiceNumber: (customerId: string, invoiceDate: string, voucherType: VoucherType = 'SALE'): string => {
    return StorageService.generateVoucherNumber(voucherType, invoiceDate, customerId);
  },

  // --- Cash & Bank Ledger ---
  _creditOrDebitAccount: (
    accountId: string,
    delta: number,
    type: AccountTransaction['type'],
    date: string,
    referenceId?: string,
    partyName?: string,
    note?: string,
    toAccountId?: string
  ) => {
    ensureDefaultAccountsAndGodowns();
    let accIdx = cache.bankAccounts.findIndex(a => a.id === accountId);
    if (accIdx < 0) accIdx = 0;
    const acc = { ...cache.bankAccounts[accIdx] };
    acc.balance = Math.round(((acc.balance || 0) + delta) * 100) / 100;
    const nextAccounts = [...cache.bankAccounts];
    nextAccounts[accIdx] = acc;
    cache.bankAccounts = nextAccounts;

    const tx: AccountTransaction = {
      id: crypto.randomUUID(),
      date: date || new Date().toISOString().split('T')[0],
      type,
      accountId: acc.id,
      amount: Math.abs(delta),
      ...(toAccountId !== undefined && { toAccountId }),
      ...(referenceId !== undefined && { referenceId }),
      ...(partyName !== undefined && { partyName }),
      ...(note !== undefined && { note }),
      reconciled: false,
      createdAt: new Date().toISOString(),
    };
    cache.accountTransactions = [tx, ...cache.accountTransactions];

    if (FirebaseService.isReady()) {
      FirebaseService.saveDocument(StorageService.getCollectionPath('bank_accounts'), acc.id, acc);
      FirebaseService.saveDocument(StorageService.getCollectionPath('account_txns'), tx.id, tx);
    }
  },

  ensureDefaultAccounts: (): BankAccount[] => {
    ensureDefaultAccountsAndGodowns();
    return [...cache.bankAccounts];
  },

  saveBankAccount: (account: BankAccount) => {
    ensureDefaultAccountsAndGodowns();
    const idx = cache.bankAccounts.findIndex(a => a.id === account.id);
    const next = [...cache.bankAccounts];
    if (idx >= 0) next[idx] = account;
    else next.push(account);
    cache.bankAccounts = next;
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('bank_accounts'), account.id, account);
  },

  deleteBankAccount: (accountId: string) => {
    if (accountId === 'cash_default' || accountId === 'bank_default') return;
    cache.bankAccounts = cache.bankAccounts.filter(a => a.id !== accountId);
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.deleteDocument(StorageService.getCollectionPath('bank_accounts'), accountId);
  },

  recordAccountAdjustment: (params: {
    accountId: string;
    toAccountId?: string;
    type: 'CONTRA' | 'ADD_MONEY' | 'REDUCE_MONEY';
    amount: number;
    date: string;
    notes?: string;
  }) => {
    const amt = Math.abs(Number(params.amount) || 0);
    if (amt <= 0) return;
    if (params.type === 'CONTRA' && params.toAccountId) {
      StorageService._creditOrDebitAccount(params.accountId, -amt, 'CONTRA_TRANSFER', params.date, undefined, undefined, params.notes || 'Contra transfer out', params.toAccountId);
      StorageService._creditOrDebitAccount(params.toAccountId, amt, 'CONTRA_TRANSFER', params.date, undefined, undefined, params.notes || 'Contra transfer in', params.accountId);
    } else if (params.type === 'ADD_MONEY') {
      StorageService._creditOrDebitAccount(params.accountId, amt, 'ADD_MONEY', params.date, undefined, undefined, params.notes || 'Cash/Bank top-up');
    } else {
      StorageService._creditOrDebitAccount(params.accountId, -amt, 'REDUCE_MONEY', params.date, undefined, undefined, params.notes || 'Cash/Bank withdrawal');
    }
    StorageService.persistToLocalStorage();
  },

  toggleTransactionReconciled: (txId: string) => {
    const idx = cache.accountTransactions.findIndex(t => t.id === txId);
    if (idx < 0) return;
    const updated = { ...cache.accountTransactions[idx], reconciled: !cache.accountTransactions[idx].reconciled };
    cache.accountTransactions[idx] = updated;
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('account_txns'), updated.id, updated);
  },

  // --- Vouchers & 1-Tap Conversion ---
  saveComplianceReferences: async (invoiceId: string, references: Pick<Invoice, 'irn' | 'ackNo' | 'ackDate' | 'ewayBillNumber' | 'ewayBillDate'>) => {
    const activeCache = cache;
    const invoice = activeCache.invoices.find(item => item.id === invoiceId && !item.isDeleted);
    if (!invoice) throw new Error('This invoice is no longer available.');
    if (activeCache.currentUserId) {
      await FirebaseService.updateDocument(StorageService.getCollectionPath('invoices'), invoiceId, references);
    }
    const index = activeCache.invoices.findIndex(item => item.id === invoiceId && !item.isDeleted);
    if (index >= 0) activeCache.invoices[index] = { ...activeCache.invoices[index], ...references };
    if (cache === activeCache) StorageService.persistToLocalStorage();
  },

  saveVoucher: (voucher: Invoice) => {
    const vType: VoucherType = voucher.type || 'SALE';
    if (vType === 'SALE') return StorageService.saveInvoice(voucher);
    if (vType === 'CREDIT_NOTE') return StorageService.saveCreditNote(voucher);
    if (vType === 'PURCHASE') {
      StorageService.savePurchase(voucher);
      return { ok: true };
    }
    if (vType === 'DEBIT_NOTE') {
      const nextProducts = [...cache.products];
      voucher.items.forEach(item => {
        const pIdx = nextProducts.findIndex(p => p.id === item.productId);
        if (pIdx >= 0 && nextProducts[pIdx].category !== 'Services') {
          nextProducts[pIdx] = { ...nextProducts[pIdx], stock: Number(nextProducts[pIdx].stock || 0) - Math.abs(Number(item.quantity) || 0) };
          if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('products'), nextProducts[pIdx].id, nextProducts[pIdx]);
        }
      });
      cache.products = nextProducts;
      const cIdx = cache.customers.findIndex(c => c.id === voucher.customerId);
      if (cIdx >= 0 && voucher.status !== 'PAID') {
        const c = { ...cache.customers[cIdx], balance: cache.customers[cIdx].balance + voucher.total };
        cache.customers[cIdx] = c;
        if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), c.id, c);
      }
      voucher.publicToken = voucher.publicToken || crypto.randomUUID();
      cache.purchases = [voucher, ...cache.purchases.filter(p => p.id !== voucher.id)];
      StorageService.persistToLocalStorage();
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('purchases'), voucher.id, voucher);
      return { ok: true };
    }
    if (vType === 'DELIVERY_CHALLAN') {
      if (!voucher.stockDeducted) {
        const nextProducts = [...cache.products];
        voucher.items.forEach(item => {
          const pIdx = nextProducts.findIndex(p => p.id === item.productId);
          if (pIdx >= 0 && nextProducts[pIdx].category !== 'Services') {
            nextProducts[pIdx] = applyDeltaToProduct(nextProducts[pIdx], -Math.abs(Number(item.quantity) || 0));
            if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('products'), nextProducts[pIdx].id, nextProducts[pIdx]);
          }
        });
        cache.products = nextProducts;
        voucher.stockDeducted = true;
        voucher.stockDeductedAt = new Date().toISOString();
      }
      voucher.publicToken = voucher.publicToken || crypto.randomUUID();
      cache.invoices = [voucher, ...cache.invoices.filter(i => i.id !== voucher.id)];
      StorageService.persistToLocalStorage();
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('invoices'), voucher.id, voucher);
      return { ok: true };
    }
    if (vType === 'PURCHASE_ORDER') {
      voucher.publicToken = voucher.publicToken || crypto.randomUUID();
      cache.purchases = [voucher, ...cache.purchases.filter(p => p.id !== voucher.id)];
      StorageService.persistToLocalStorage();
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('purchases'), voucher.id, voucher);
      return { ok: true };
    }
    // Non-posting: QUOTATION, PROFORMA
    voucher.publicToken = voucher.publicToken || crypto.randomUUID();
    cache.invoices = [voucher, ...cache.invoices.filter(i => i.id !== voucher.id)];
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('invoices'), voucher.id, voucher);
    return { ok: true };
  },

  updateVoucher: (voucher: Invoice) => {
    const vType = voucher.type || 'SALE';
    if (vType === 'SALE' || vType === 'CREDIT_NOTE') {
      StorageService.updateInvoice(voucher);
      return;
    }
    const listKey = vType === 'PURCHASE' || vType === 'PURCHASE_ORDER' || vType === 'DEBIT_NOTE' ? 'purchases' : 'invoices';
    const arr = cache[listKey];
    const idx = arr.findIndex(v => v.id === voucher.id);
    if (idx >= 0) {
      arr[idx] = voucher;
      StorageService.persistToLocalStorage();
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath(listKey), voucher.id, voucher);
    }
  },

  convertVoucher: (sourceId: string, targetType: VoucherType): Invoice | null => {
    const all = StorageService.getAllVouchers();
    const src = all.find(v => v.id === sourceId);
    if (!src) return null;
    const permittedTarget = src.type === 'PURCHASE_ORDER' ? 'PURCHASE'
      : src.type === 'QUOTATION' || src.type === 'PROFORMA' || src.type === 'DELIVERY_CHALLAN' ? 'SALE' : null;
    if (targetType !== permittedTarget || src.conversionStatus === 'CANCELLED') return null;
    if (src.conversionStatus === 'CONVERTED' || src.convertedToId || src.convertedToInvoiceId) {
      const existingId = src.convertedToId || src.convertedToInvoiceId;
      return all.find(v => v.id === existingId && v.type === targetType) || null;
    }

    const today = new Date().toISOString().split('T')[0];
    const newId = crypto.randomUUID();
    const converted: Invoice = {
      ...src,
      id: newId,
      type: targetType,
      invoiceNumber: StorageService.generateVoucherNumber(targetType, today, src.customerId),
      date: today,
      convertedFromId: src.id,
      convertedFromType: src.type || 'SALE',
      convertedToId: undefined,
      convertedToInvoiceId: undefined,
      conversionStatus: 'OPEN',
      publicToken: crypto.randomUUID(),
      // Delivery Challan already deducted stock; preserve flag so SALE doesn't double deduct
      stockDeducted: src.type === 'DELIVERY_CHALLAN' && targetType === 'SALE' ? Boolean(src.stockDeducted) : false,
      saveIdempotencyKey: undefined,
    };

    const result = StorageService.saveVoucher(converted);
    if (!result.ok) return null;

    const srcListKey = src.type === 'PURCHASE_ORDER' ? 'purchases' : 'invoices';
    const srcIdx = cache[srcListKey].findIndex(v => v.id === src.id);
    if (srcIdx >= 0) {
      cache[srcListKey][srcIdx] = {
        ...cache[srcListKey][srcIdx],
        conversionStatus: 'CONVERTED',
        convertedToId: newId,
        convertedToInvoiceId: newId,
      };
      if (FirebaseService.isReady()) {
        FirebaseService.saveDocument(StorageService.getCollectionPath(srcListKey), src.id, cache[srcListKey][srcIdx]);
      }
      StorageService.persistToLocalStorage();
    }

    return converted;
  },

  // --- Godowns & Transfers ---
  ensureDefaultGodown: (): Godown[] => {
    ensureDefaultAccountsAndGodowns();
    return [...cache.godowns];
  },

  saveGodown: (godown: Godown) => {
    ensureDefaultAccountsAndGodowns();
    const idx = cache.godowns.findIndex(g => g.id === godown.id);
    const next = [...cache.godowns];
    if (idx >= 0) next[idx] = godown;
    else next.push(godown);
    cache.godowns = next;
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('godowns'), godown.id, godown);
  },

  deleteGodown: (godownId: string) => {
    if (godownId === 'godown_main') return;
    cache.godowns = cache.godowns.filter(g => g.id !== godownId);
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.deleteDocument(StorageService.getCollectionPath('godowns'), godownId);
  },

  transferStockBetweenGodowns: (transfer: Omit<GodownTransfer, 'id' | 'createdAt'>): GodownTransfer => {
    const full: GodownTransfer = {
      ...transfer,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    const nextProducts = [...cache.products];
    full.items.forEach(item => {
      const pIdx = nextProducts.findIndex(p => p.id === item.productId);
      if (pIdx < 0) return;
      const prod = { ...nextProducts[pIdx] };
      const map = { ...(prod.godownStocks || { godown_main: prod.stock || 0 }) };
      map[full.fromGodownId] = Math.max(0, Number(map[full.fromGodownId] || 0) - item.quantity);
      map[full.toGodownId] = Number(map[full.toGodownId] || 0) + item.quantity;
      prod.godownStocks = map;
      nextProducts[pIdx] = prod;
      if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('products'), prod.id, prod);
    });
    cache.products = nextProducts;
    cache.godownTransfers = [full, ...cache.godownTransfers];
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('godown_transfers'), full.id, full);
    return full;
  },

  // --- Automated Recurring Bills ---
  saveAutomatedBill: (bill: AutomatedBill) => {
    const idx = cache.automatedBills.findIndex(b => b.id === bill.id);
    const next = [...cache.automatedBills];
    if (idx >= 0) next[idx] = bill;
    else next.unshift(bill);
    cache.automatedBills = next;
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('automated_bills'), bill.id, bill);
  },

  deleteAutomatedBill: (billId: string) => {
    cache.automatedBills = cache.automatedBills.filter(b => b.id !== billId);
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.deleteDocument(StorageService.getCollectionPath('automated_bills'), billId);
  },

  runDueAutomatedBills: () => {
    const today = currentBillingDate();
    const result = { created: 0, recovered: 0, issues: [] as string[] };
    const nextBills = cache.automatedBills.map(bill => {
      if (!bill.active) return bill;
      const period = bill.nextRunDate;
      const scheduledDate = parseBillingDate(period);
      if (!scheduledDate) {
        result.issues.push(`${bill.title}: choose a valid next billing date.`);
        return bill;
      }
      if (period > today) return bill;
      const invoiceId = `recurring-${bill.id}-${period}`;
      const anchorDay = bill.billingDay && Number.isInteger(bill.billingDay) && bill.billingDay >= 1 && bill.billingDay <= 31
        ? bill.billingDay : scheduledDate.getUTCDate();
      const upcomingDate = nextBillingDate(scheduledDate, bill.frequency, anchorDay);
      if (!upcomingDate) {
        result.issues.push(`${bill.title}: choose a valid repeat interval.`);
        return bill;
      }
      const updated = {
        ...bill, billingDay: anchorDay, lastRunDate: today, nextRunDate: upcomingDate,
        generatedCount: (bill.generatedCount || 0) + 1,
      };
      if (cache.invoices.some(invoice => invoice.id === invoiceId)) {
        result.recovered++;
        return updated;
      }
      const customer = cache.customers.find(c => c.id === bill.customerId && c.type !== 'VENDOR');
      if (!customer || !bill.items?.length || !Number.isFinite(bill.total) || bill.total <= 0) {
        result.issues.push(`${bill.title}: check the customer, items and amount.`);
        return bill;
      }
      const creditDays = customer.creditPeriodDays ?? 15;
      const inv: Invoice = {
        id: invoiceId,
        type: 'SALE',
        invoiceNumber: StorageService.generateVoucherNumber('SALE', period, bill.customerId),
        customerId: bill.customerId,
        customerName: customer.company || customer.name,
        customerAddress: customer.address || '',
        customerState: customer.state,
        customerGstin: customer.gstin,
        date: period,
        dueDate: addBillingDays(scheduledDate, Number.isInteger(creditDays) && creditDays >= 0 && creditDays <= 3650 ? creditDays : 15),
        items: bill.items.map(item => ({ ...item })),
        subtotal: bill.total,
        total: bill.total,
        gstEnabled: bill.gstEnabled ?? true,
        status: 'PENDING',
        paymentMode: 'CREDIT',
        notes: bill.notes || `Auto-generated recurring bill (${bill.title})`,
      };
      const saved = StorageService.saveInvoice(inv);
      if (!saved.ok) {
        result.issues.push(`${bill.title}: ${saved.error || 'the invoice could not be saved.'}`);
        return bill;
      }
      result.created++;
      return updated;
    });
    if (result.created || result.recovered) {
      const previousBills = cache.automatedBills;
      cache.automatedBills = nextBills;
      StorageService.persistToLocalStorage();
      if (FirebaseService.isReady()) {
        nextBills.forEach((bill, idx) => {
          if (bill !== previousBills[idx]) FirebaseService.saveDocument(StorageService.getCollectionPath('automated_bills'), bill.id, bill);
        });
      }
    }
    return result;
  },

  // --- Staff & Roles ---
  saveStaffMember: (member: StaffMember) => {
    const idx = cache.staffMembers.findIndex(m => m.id === member.id);
    const next = [...cache.staffMembers];
    if (idx >= 0) next[idx] = member;
    else next.push(member);
    cache.staffMembers = next;
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('staff_members'), member.id, member);
  },

  deleteStaffMember: (id: string) => {
    cache.staffMembers = cache.staffMembers.filter(m => m.id !== id);
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.deleteDocument(StorageService.getCollectionPath('staff_members'), id);
  },

  // --- Recycle Bin ---
  getDeletedItems: () => ({
    invoices: cache.invoices.filter(i => i.isDeleted),
    purchases: cache.purchases.filter(p => p.isDeleted),
    payments: cache.payments.filter(p => p.isDeleted),
    expenses: cache.expenses.filter(e => e.isDeleted),
  }),

  restoreDeletedItem: (kind: 'INVOICE' | 'PURCHASE' | 'PAYMENT' | 'EXPENSE', id: string) => {
    const restoreFlag = { isDeleted: false, deletedAt: undefined };
    if (kind === 'INVOICE') {
      const idx = cache.invoices.findIndex(i => i.id === id);
      if (idx >= 0) {
        cache.invoices[idx] = { ...cache.invoices[idx], ...restoreFlag };
        if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('invoices'), id, cache.invoices[idx]);
      }
    } else if (kind === 'PURCHASE') {
      const idx = cache.purchases.findIndex(p => p.id === id);
      if (idx >= 0) {
        cache.purchases[idx] = { ...cache.purchases[idx], ...restoreFlag };
        if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('purchases'), id, cache.purchases[idx]);
      }
    } else if (kind === 'PAYMENT') {
      const idx = cache.payments.findIndex(p => p.id === id);
      if (idx >= 0 && cache.payments[idx].isDeleted) {
        const restored: Payment = { ...cache.payments[idx], isDeleted: false };
        delete restored.deletedAt;
        if (restored.settlementReversedOnDelete) {
          restored.allocations = applyPaymentToBillsAndParty(restored, false);
          applyPaymentToAccount(restored, false);
          restored.settlementReversedOnDelete = false;
        }
        storePayment(restored, idx);
      }
    } else if (kind === 'EXPENSE') {
      const idx = cache.expenses.findIndex(e => e.id === id);
      if (idx >= 0) {
        cache.expenses[idx] = { ...cache.expenses[idx], ...restoreFlag };
        if (FirebaseService.isReady()) FirebaseService.saveDocument(StorageService.getCollectionPath('expenses'), id, cache.expenses[idx]);
      }
    }
    StorageService.persistToLocalStorage();
  },

  permanentlyDeleteItem: (kind: 'INVOICE' | 'PURCHASE' | 'PAYMENT' | 'EXPENSE', id: string) => {
    const colMap = { INVOICE: 'invoices', PURCHASE: 'purchases', PAYMENT: 'payments', EXPENSE: 'expenses' } as const;
    if (kind === 'INVOICE') cache.invoices = cache.invoices.filter(i => i.id !== id);
    else if (kind === 'PURCHASE') cache.purchases = cache.purchases.filter(p => p.id !== id);
    else if (kind === 'PAYMENT') cache.payments = cache.payments.filter(p => p.id !== id);
    else if (kind === 'EXPENSE') cache.expenses = cache.expenses.filter(e => e.id !== id);
    StorageService.persistToLocalStorage();
    if (FirebaseService.isReady()) FirebaseService.deleteDocument(StorageService.getCollectionPath(colMap[kind]), id);
  },

  // --- Financial Year Close ---
  closeFinancialYear: (newFyLabel: string): { carriedParties: number; carriedProducts: number } => {
    const nextCustomers = cache.customers.map(c => ({ ...c, openingBalance: c.balance }));
    cache.customers = nextCustomers;
    const prevCfg = cache.company.prefixConfig || {
      useCustomPrefix: true,
      fyLabel: newFyLabel,
      prefixes: {
        SALE: 'INV', PURCHASE: 'PUR', CREDIT_NOTE: 'CN', QUOTATION: 'QTN',
        PROFORMA: 'PI', DELIVERY_CHALLAN: 'DC', DEBIT_NOTE: 'DN', PURCHASE_ORDER: 'PO'
      },
      sequences: {
        SALE: 1, PURCHASE: 1, CREDIT_NOTE: 1, QUOTATION: 1,
        PROFORMA: 1, DELIVERY_CHALLAN: 1, DEBIT_NOTE: 1, PURCHASE_ORDER: 1
      }
    };
    const nextProfile: CompanyProfile = {
      ...cache.company,
      prefixConfig: {
        ...prevCfg,
        useCustomPrefix: true,
        fyLabel: newFyLabel,
        sequences: {
          SALE: 1, PURCHASE: 1, CREDIT_NOTE: 1, QUOTATION: 1,
          PROFORMA: 1, DELIVERY_CHALLAN: 1, DEBIT_NOTE: 1, PURCHASE_ORDER: 1
        }
      }
    };
    StorageService.saveCompanyProfile(nextProfile);
    if (FirebaseService.isReady()) {
      nextCustomers.forEach(c => FirebaseService.saveDocument(StorageService.getCollectionPath('customers'), c.id, c));
    }
    return { carriedParties: nextCustomers.length, carriedProducts: cache.products.length };
  },

  exportAllData: (): string => {
    const data = {
      products: JSON.stringify(cache.products),
      customers: JSON.stringify(cache.customers),
      invoices: JSON.stringify(cache.invoices),
      purchases: JSON.stringify(cache.purchases),
      payments: JSON.stringify(cache.payments),
      expenses: JSON.stringify(cache.expenses),
      bankAccounts: JSON.stringify(cache.bankAccounts),
      accountTransactions: JSON.stringify(cache.accountTransactions),
      godowns: JSON.stringify(cache.godowns),
      godownTransfers: JSON.stringify(cache.godownTransfers),
      automatedBills: JSON.stringify(cache.automatedBills),
      staffMembers: JSON.stringify(cache.staffMembers),
      company: JSON.stringify(cache.company),
      timestamp: new Date().toISOString()
    };
    return JSON.stringify(data);
  },

  importData: async (jsonString: string): Promise<{ success: boolean; message: string }> => {
    try {
      let data: any;
      try {
        data = JSON.parse(jsonString);
      } catch {
        return { success: false, message: "Invalid JSON file format." };
      }

      if (data.products) cache.products = JSON.parse(data.products);
      if (data.customers) cache.customers = JSON.parse(data.customers);
      if (data.invoices) cache.invoices = JSON.parse(data.invoices);
      if (data.payments) cache.payments = JSON.parse(data.payments);
      if (data.expenses) cache.expenses = JSON.parse(data.expenses);
      if (data.bankAccounts) cache.bankAccounts = JSON.parse(data.bankAccounts);
      if (data.accountTransactions) cache.accountTransactions = JSON.parse(data.accountTransactions);
      if (data.godowns) cache.godowns = JSON.parse(data.godowns);
      if (data.godownTransfers) cache.godownTransfers = JSON.parse(data.godownTransfers);
      if (data.automatedBills) cache.automatedBills = JSON.parse(data.automatedBills);
      if (data.staffMembers) cache.staffMembers = JSON.parse(data.staffMembers);
      if (data.company) cache.company = JSON.parse(data.company);
      if (data.purchases) {
        cache.purchases = JSON.parse(data.purchases);
      } else if (data.products) {
        cache.purchases = [];
      }
      ensureDefaultAccountsAndGodowns();

      StorageService.persistToLocalStorage();

      if (FirebaseService.isReady() && cache.currentUserId) {
        try {
          const saveCollection = async (items: any[], name: string) => {
            for (const item of items) {
              await FirebaseService.saveDocument(StorageService.getCollectionPath(name), item.id, item);
            }
          };

          await FirebaseService.saveDocument(StorageService.getCollectionPath('company'), 'profile', cache.company);
          await saveCollection(cache.products, 'products');
          await saveCollection(cache.customers, 'customers');
          await saveCollection(cache.invoices, 'invoices');
          await saveCollection(cache.payments, 'payments');
          await saveCollection(cache.expenses, 'expenses');
          await saveCollection(cache.purchases, 'purchases');
          await saveCollection(cache.bankAccounts, 'bank_accounts');
          await saveCollection(cache.accountTransactions, 'account_txns');
          await saveCollection(cache.godowns, 'godowns');
          await saveCollection(cache.godownTransfers, 'godown_transfers');
          await saveCollection(cache.automatedBills, 'automated_bills');
          await saveCollection(cache.staffMembers, 'staff_members');
        } catch (cloudError: any) {
          console.error("Cloud Sync Failed", cloudError);
          return { success: true, message: "Local data restored, but Cloud Sync failed: " + (cloudError.message || "Unknown error") };
        }
      }

      return { success: true, message: "Data restored successfully!" };
    } catch (e: any) {
      console.error("Import failed", e);
      return { success: false, message: "Import failed: " + (e.message || "Unknown error") };
    }
  },

  syncAllToPublic: async (): Promise<{ success: boolean; count: number }> => {
    if (!FirebaseService.isReady()) return { success: false, count: 0 };

    try {
      let count = 0;
      for (const invoice of cache.invoices) {
        await FirebaseService.saveDocument('publicBills', invoice.id, {
          ...invoice,
          _company: cache.company
        });
        count++;
      }
      return { success: true, count };
    } catch (err) {
      console.error("Sync Error:", err);
      return { success: false, count: 0 };
    }
  },

  // --- Multi-Company Support ---

  getAllCompanies: (): CompanyProfile[] => {
    const list = localStorage.getItem(getKeys().COMPANIES_LIST);
    const companies: CompanyProfile[] = list ? JSON.parse(list) : [];

    // Ensure current company (from cache) is in the list
    if (cache.company && !companies.some(c => c.name === cache.company.name)) {
      // If current company has no ID, give it 'default' or existing active ID
      const activeId = getActiveCompanyId();
      const currentWithId = { ...cache.company, id: activeId || 'default' };
      companies.push(currentWithId);
      localStorage.setItem(getKeys().COMPANIES_LIST, JSON.stringify(companies));
    }
    return companies;
  },

  createCompany: (profile: CompanyProfile) => {
    const companies = StorageService.getAllCompanies();
    const newId = crypto.randomUUID();
    const newCompany = { ...profile, id: newId };
    companies.push(newCompany);
    localStorage.setItem(getKeys().COMPANIES_LIST, JSON.stringify(companies));

    // Switch to it immediately? Usually user wants to switch explicitly, but let's just save.
    return newId;
  },

  switchCompany: (companyId: string) => {
    // 1. Save current state first to be safe
    StorageService.persistToLocalStorage();

    // 2. Set new active ID
    // If switching to 'default' (legacy), use empty string if we treat it that way, 
    // but better to use the ID consistent with how we stored it.
    // If id matches 'default', we might map it to '' or keep it 'default'.
    // Given my dynamic key logic: 
    // const activeIdentifier = getActiveCompanyId(); 
    // const keyPrefix = activeIdentifier ? `${activeIdentifier}_` : '';

    // If companyId is 'default', let's assume valid ID or special handling.
    // For simplicity, just set check:
    localStorage.setItem('active_company_id', companyId === 'default' ? '' : companyId);

    // 3. Reload to re-initialize KEYS and Cache
    window.location.reload();
  },

  // --- Admin Ads (Super Admin Feature) ---
  getAdminAds: (): AdminAd[] => {
    try {
      const stored = localStorage.getItem(getKeys().ADMIN_ADS);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  },

  saveAdminAds: (ads: AdminAd[]) => {
    localStorage.setItem(getKeys().ADMIN_ADS, JSON.stringify(ads));
    // In a real app, you would also save to Firestore here:
    // FirebaseService.saveCollection('system/ads', ads);
  },

  // --- Changelog & Notification Helpers ---
  getLastSeenVersion: (): string | null => {
    return localStorage.getItem('app_last_seen_version');
  },

  setLastSeenVersion: (version: string) => {
    localStorage.setItem('app_last_seen_version', version);
  },

  getShouldShowChangelog: (): boolean => {
    return localStorage.getItem('app_should_show_changelog') === 'true';
  },

  setShouldShowChangelog: (should: boolean) => {
    localStorage.setItem('app_should_show_changelog', String(should));
  },

  getLastNotificationDate: (): string | null => {
    return localStorage.getItem('app_last_notification_date');
  },

  setLastNotificationDate: (date: string) => {
    localStorage.setItem('app_last_notification_date', date);
  }
};
