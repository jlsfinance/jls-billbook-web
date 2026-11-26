
export type VoucherType =
  | 'SALE'
  | 'PURCHASE'
  | 'CREDIT_NOTE'
  | 'QUOTATION'
  | 'PROFORMA'
  | 'DELIVERY_CHALLAN'
  | 'DEBIT_NOTE'
  | 'PURCHASE_ORDER';

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  INVOICES = 'INVOICES',
  ALL_INVOICES = 'ALL_INVOICES',
  CREATE_INVOICE = 'CREATE_INVOICE',
  EDIT_INVOICE = 'EDIT_INVOICE',
  CREATE_PURCHASE = 'CREATE_PURCHASE',
  EDIT_PURCHASE = 'EDIT_PURCHASE',
  PURCHASES = 'PURCHASES',
  INVENTORY = 'INVENTORY',
  CUSTOMERS = 'CUSTOMERS',
  VIEW_INVOICE = 'VIEW_INVOICE',
  CUSTOMER_LEDGER = 'CUSTOMER_LEDGER',
  REPORTS = 'REPORTS',
  SETTINGS = 'SETTINGS',
  DAYBOOK = 'DAYBOOK',
  IMPORT = 'IMPORT',
  EXPENSES = 'EXPENSES',
  PAYMENTS = 'PAYMENTS',
  PUBLIC_VIEW_INVOICE = 'PUBLIC_VIEW_INVOICE',
  SMART_CALCULATOR = 'SMART_CALCULATOR',
  CREDIT_NOTE = 'CREDIT_NOTE',
  STOCK_IN = 'STOCK_IN',
  CREATE_CREDIT_NOTE = 'CREATE_CREDIT_NOTE',
  // Expanded SMB billing suite views
  QUOTATIONS = 'QUOTATIONS',
  PROFORMA_INVOICES = 'PROFORMA_INVOICES',
  DELIVERY_CHALLANS = 'DELIVERY_CHALLANS',
  PURCHASE_ORDERS = 'PURCHASE_ORDERS',
  DEBIT_NOTES = 'DEBIT_NOTES',
  CREATE_VOUCHER = 'CREATE_VOUCHER',
  POS_BILLING = 'POS_BILLING',
  CASH_AND_BANK = 'CASH_AND_BANK',
  GODOWNS = 'GODOWNS',
  BARCODE_LABELS = 'BARCODE_LABELS',
  ONLINE_STORE = 'ONLINE_STORE',
  PAYMENT_REMINDERS = 'PAYMENT_REMINDERS',
  AUTOMATED_BILLS = 'AUTOMATED_BILLS',
  COMPLIANCE_CENTER = 'COMPLIANCE_CENTER',
  ACCOUNTANT_EXPORT = 'ACCOUNTANT_EXPORT',
  CUSTOMER_ENGAGEMENT = 'CUSTOMER_ENGAGEMENT',
  STAFF_ROLES = 'STAFF_ROLES',
  RECYCLE_BIN = 'RECYCLE_BIN',
  MORE_HUB = 'MORE_HUB',
}

export interface Expense {
  id: string;
  createdBy?: string;
  category: string; // e.g., 'Rent', 'Electricity', 'Salary', 'Tea/Snacks'
  description?: string;
  amount: number;
  date: string;
  paymentMode: 'CASH' | 'UPI' | 'BANK_TRANSFER';
  gstRate?: number;
  gstAmount?: number;
  vendorName?: string;
  vendorGstin?: string;
  itcEligible?: boolean;
  invoiceRef?: string;
  accountId?: string;
  isDeleted?: boolean;
  deletedAt?: string;
}


export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface ProductBatch {
  id: string;
  batchNo: string;
  expiryDate?: string;
  mfgDate?: string;
  mrp?: number;
  purchasePrice?: number;
  sellingPrice: number;
  stock: number;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  purchasePrice?: number; // Added for Purchase
  mrp?: number;
  wholesalePrice?: number;
  stock: number;
  category: string;
  hsn?: string;
  gstRate?: number;
  description?: string;
  // --- Barcode & stock management ---
  barcode?: string;            // Normalized unique string. Leading zeros preserved, never coerced to number.
  barcodeFormat?: string;      // EAN-13, EAN-8, UPC-A, UPC-E, ITF-14, CODE128, CODE39, GENERIC
  barcodeEnabled?: boolean;    // barcode lookup active/inactive (default true)
  unit?: string;               // pcs, kg, litre, box ...
  secondaryUnit?: string;      // e.g. 'pcs' when primary is 'box'
  conversionRate?: number;     // e.g. 1 box = 12 pcs
  lowStockThreshold?: number;  // per-product reorder alert level (defaults to global 10)
  trackBatch?: boolean;
  batches?: ProductBatch[];
  trackSerial?: boolean;
  serialNumbers?: string[];
  godownStocks?: Record<string, number>;
  showInOnlineStore?: boolean;
  isArchived?: boolean;        // archive instead of delete so invoice history stays intact
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerNotification {
  id: string;
  type: 'INVOICE' | 'PAYMENT' | 'REMINDER' | 'SYSTEM';
  title: string;
  message: string;
  date: string;
  read: boolean;
}

export interface Customer {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  shippingAddress?: string;
  state?: string;
  gstin?: string;
  balance: number;
  openingBalance?: number;
  type?: 'CUSTOMER' | 'VENDOR' | 'BOTH'; // Added to distinguish
  creditLimit?: number;
  creditPeriodDays?: number;
  partyCategory?: string;
  birthday?: string;
  loyaltyPoints?: number;
  notifications: CustomerNotification[];
  behaviorScore?: number; // 0-100
  followUpHistory?: { date: string, note: string }[];
}

export interface PaymentAllocation {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
}

export interface Payment {
  id: string;
  createdBy?: string;
  customerId: string;
  date: string;
  amount: number;
  mode: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';
  type?: 'RECEIVED' | 'PAID' | 'RECEIPT'; // RECEIVED = In from Customer, PAID = Out to Vendor, RECEIPT = Against Invoice
  accountId?: string;
  allocations?: PaymentAllocation[];
  chequeStatus?: 'PENDING' | 'CLEARED' | 'BOUNCED';
  chequeDate?: string;
  reference?: string; // Cheque number or UPI Ref
  note?: string;
  notes?: string; // Alias for note
  invoiceId?: string; // Link to Invoice for receipts
  invoiceNumber?: string; // Invoice number for reference
  isDeleted?: boolean;
  deletedAt?: string;
  settlementReversedOnDelete?: boolean;
}

export interface InvoiceItem {
  productId: string;
  barcodeSnapshot?: string; // barcode at billing time; keeps history safe if barcode later edited
  description: string;
  quantity: number;
  unit?: string;
  rate: number;
  baseAmount: number;
  discountType?: 'PERCENTAGE' | 'AMOUNT';
  discountValue?: number;
  discountAmount?: number; // The actual subtracted amount
  hsn?: string;
  gstRate?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  totalAmount?: number;
  batchNo?: string;
  expiryDate?: string;
  serialNumbers?: string[];
}

export interface AdditionalCharge {
  id: string;
  label: string;
  amount: number;
}

export interface Invoice {
  id: string;
  createdBy?: string;
  type?: VoucherType;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerAddress: string;
  shippingAddress?: string;
  customerState?: string;
  customerGstin?: string;
  supplierGstin?: string;
  taxType?: 'INTRA_STATE' | 'INTER_STATE';
  date: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  totalCgst?: number;
  totalSgst?: number;
  totalIgst?: number;
  gstEnabled?: boolean;
  additionalCharges?: AdditionalCharge[];
  tdsRate?: number;
  tdsAmount?: number;
  tcsRate?: number;
  tcsAmount?: number;
  roundUpTo?: 0 | 10 | 100; // 0 = no rounding, 10 = round to nearest 10, 100 = round to nearest 100
  roundUpAmount?: number; // Amount added by rounding (calculated, not user set)
  total: number;
  status: 'PAID' | 'PENDING' | 'PARTIAL' | 'OVERDUE';
  paymentMode?: 'CASH' | 'CREDIT' | 'ONLINE';
  amountReceived?: number; // Amount received at the time of sale
  balanceDue?: number; // Remaining balance
  discountType?: 'PERCENTAGE' | 'AMOUNT';
  discountValue?: number;
  discountAmount?: number;
  paidAmount?: number; // Amount paid/received
  splitCashAmount?: number;
  splitOnlineAmount?: number;
  publicToken?: string;
  expiresAt?: any; // For public secure links
  previousBalance?: number; // Outstanding balance from previous invoices
  notes?: string;
  terms?: string;
  poNumber?: string;
  vehicleNumber?: string;
  transporterName?: string;
  transporterId?: string;
  transportDistanceKm?: number;
  ewayBillNumber?: string;
  ewayBillDate?: string;
  irn?: string;
  ackNo?: string;
  ackDate?: string;
  godownId?: string;
  accountId?: string;
  convertedFromId?: string;
  convertedFromType?: VoucherType;
  convertedToId?: string;
  convertedToInvoiceId?: string;
  conversionStatus?: 'OPEN' | 'CONVERTED' | 'CANCELLED';
  templateFormat?: InvoiceFormat;
  // --- Stock deduction bookkeeping ---
  stockDeducted?: boolean;
  stockDeductedAt?: string;
  saveIdempotencyKey?: string; // protects against double-click / retry double deduction
  isDeleted?: boolean;
  deletedAt?: string;
}

// ... existing code
export enum InvoiceFormat {
  DEFAULT = 'DEFAULT',
  MODERN = 'MODERN',
  MINIMAL = 'MINIMAL',
  DESI_BILL_BOOK = 'DESI_BILL_BOOK', // Traditional Indian Bahi Khata style
  KACCHI_BILL_BOOK = 'KACCHI_BILL_BOOK', // Simple handwritten style look
  TALLY_PRIME_STYLE = 'TALLY_PRIME_STYLE', // Tally accounting software style
  PROFESSIONAL = 'PROFESSIONAL',
  ELEGANT = 'ELEGANT',
  COMPACT = 'COMPACT',
  BOLD = 'BOLD',
  RETRO = 'RETRO'
}

export interface InvoicePrefixConfig {
  useCustomPrefix: boolean;
  fyLabel: string;
  prefixes: Record<VoucherType, string>;
  sequences: Record<VoucherType, number>;
}

export interface InvoiceSettings {
  format: InvoiceFormat;
  showWatermark?: boolean;
  watermarkText?: string;
  primaryColor?: string;
  thermalSize?: '58mm' | '80mm';
  signatureText?: string;
  termsText?: string;
}

export interface OnlineStoreSettings {
  enabled: boolean;
  storeName: string;
  tagline?: string;
  whatsappPhone?: string;
  minOrderAmount?: number;
}

export interface CompanyProfile {
  id?: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  state?: string;
  gstin?: string;
  gst?: string;
  gst_enabled?: boolean;
  show_hsn_summary?: boolean;
  roundUpDefault?: 0 | 10 | 100; // Default round-up for all invoices (0 = no rounding)
  upiId?: string; // e.g., merchant@upi
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  thermalSize?: '58mm' | '80mm';
  signatureText?: string;
  termsText?: string;
  language?: 'en' | 'hi' | 'hinglish';
  appPin?: string;
  caEmail?: string;
  caPhone?: string;
  prefixConfig?: InvoicePrefixConfig;
  onlineStore?: OnlineStoreSettings;
  greetingSettings?: GreetingSettings;
  adminGreeting?: AdminGreeting;
  invoiceSettings?: InvoiceSettings;
}

export interface BankAccount {
  id: string;
  name: string;
  type: 'CASH' | 'BANK' | 'UPI_WALLET';
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  upiId?: string;
  openingBalance: number;
  balance: number;
  isDefault?: boolean;
  createdAt: string;
}

export interface AccountTransaction {
  id: string;
  date: string;
  type: 'CONTRA_TRANSFER' | 'ADD_MONEY' | 'REDUCE_MONEY' | 'RECEIPT' | 'PAYMENT' | 'EXPENSE' | 'CASH_SALE';
  accountId: string;
  toAccountId?: string;
  amount: number;
  referenceId?: string;
  partyName?: string;
  note?: string;
  reconciled?: boolean;
  createdAt: string;
}

export interface Godown {
  id: string;
  name: string;
  address?: string;
  incharge?: string;
  isMain?: boolean;
  createdAt: string;
}

export interface GodownTransfer {
  id: string;
  transferNumber: string;
  date: string;
  fromGodownId: string;
  toGodownId: string;
  items: { productId: string; productName: string; quantity: number }[];
  note?: string;
  createdAt: string;
}

export interface AutomatedBill {
  id: string;
  title: string;
  customerId: string;
  customerName: string;
  frequency: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  nextRunDate: string;
  billingDay?: number;
  lastRunDate?: string;
  active: boolean;
  items: InvoiceItem[];
  gstEnabled?: boolean;
  notes?: string;
  total: number;
  generatedCount: number;
  createdAt: string;
}

export type StaffRole = 'OWNER' | 'ADMIN' | 'SALESMAN' | 'STOCK_MANAGER' | 'CA_VIEWER';

export interface StaffMember {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: StaffRole;
  permissions: string[];
  active: boolean;
  createdAt: string;
}

export interface GreetingSettings {
  enableFestivalGreetings: boolean;
  useAiEnhancement: boolean;
  autoShareWhatsapp: boolean;
}

export interface AdminGreeting {
  message: string;
  enabled: boolean;
  expiresAt: string; // ISO date string
}

export interface Festival {
  name: string;
  date: string; // YYYY-MM-DD
  defaultMessage: string;
}

// Mock Data Defaults
export const DEFAULT_COMPANY: CompanyProfile = {
  name: "ABC Trading Company",
  address: "123, Market Road, Delhi - 110001",
  phone: "9876543210",
  email: "info@abctrading.com",
  state: "Delhi",
  gst_enabled: true
};
export interface AdminAd {
  id: string;
  title: string;
  content: string;
  buttonText?: string;
  actionUrl?: string;
  type: 'INFO' | 'PROMO' | 'ALERT' | 'UPDATE';
  gradient: string;
  isActive: boolean;
  imageUrl?: string;
}

export interface ContactSuggestion {
  name: string;
  phone: string;
}

// ============================================================
// Barcode + Stock management types
// ============================================================

export type StockMovementType =
  | 'OPENING_STOCK'
  | 'STOCK_IN'
  | 'SALE'
  | 'SALE_RETURN'
  | 'DAMAGE'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'STOCK_COUNT_CORRECTION';

export type StockReferenceType = 'INVOICE' | 'CREDIT_NOTE' | 'PURCHASE' | 'ADJUSTMENT' | 'STOCK_COUNT';

/**
 * Immutable ledger row. Every stock change writes one of these.
 * Invariant: stockAfter === stockBefore + quantityDelta
 */
export interface StockMovement {
  id: string;
  userId?: string;
  productId: string;
  barcodeSnapshot?: string;
  movementType: StockMovementType;
  quantityDelta: number;   // positive = increase, negative = decrease
  stockBefore: number;
  stockAfter: number;
  unitCost?: number;
  referenceType?: StockReferenceType;
  referenceId?: string;
  reason?: string;
  performedBy?: string;
  idempotencyKey?: string;
  createdAt: string;
}

export interface StockEntryItem {
  id: string;
  productId: string;
  barcodeSnapshot?: string;
  productNameSnapshot: string;
  quantity: number;
  unitCost?: number;
  lineTotal?: number;
  createdAt: string;
}

export type StockEntryStatus = 'DRAFT' | 'COMPLETED' | 'CANCELLED';

/** Header for a multi-scan stock-in session. */
export interface StockEntry {
  id: string;
  entryNumber: string;
  entryDate: string;
  supplierId?: string;
  supplierNameSnapshot?: string;
  supplierInvoiceNumber?: string;
  totalItems: number;
  totalQuantity: number;
  totalValue: number;
  status: StockEntryStatus;
  note?: string;
  createdBy?: string;
  createdAt: string;
  completedAt?: string;
  items: StockEntryItem[];
}

export type BarcodeScanSource = 'CAMERA' | 'USB' | 'BLUETOOTH' | 'MANUAL';
export type BarcodeScanContext = 'INVENTORY' | 'INVOICE' | 'STOCK_IN' | 'PRODUCT_EDIT';
export type BarcodeScanResult = 'MATCHED' | 'NOT_FOUND' | 'INVALID' | 'DUPLICATE' | 'ERROR';

/** Analytics/audit only — never a source of truth. Raw camera frames are never stored. */
export interface BarcodeScanEvent {
  id: string;
  userId?: string;
  productId?: string;
  barcodeHash?: string; // hashed, not raw
  source: BarcodeScanSource;
  context: BarcodeScanContext;
  result: BarcodeScanResult;
  latencyMs?: number;
  performedBy?: string;
  createdAt: string;
}
