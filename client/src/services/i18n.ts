export type AppLanguage = 'en' | 'hi' | 'hinglish';

const LANG_KEY = 'app_language_pref';

type Dict = Record<string, string>;

const EN: Dict = {
  home: 'Home',
  parties: 'Parties',
  items: 'Items',
  bills: 'Bills',
  more: 'More',
  toCollect: 'To Collect',
  toPay: 'To Pay',
  cashBank: 'Cash & Bank',
  stockValue: 'Stock Value',
  createBill: 'Create Bill',
  sales: 'Sales',
  purchases: 'Purchases',
  quotations: 'Quotations',
  proforma: 'Proforma Invoice',
  challan: 'Delivery Challan',
  creditNote: 'Sales Return (CN)',
  debitNote: 'Purchase Return (DN)',
  purchaseOrder: 'Purchase Order',
  posBilling: 'POS Counter',
  expenses: 'Expenses',
  payments: 'Payments & Receipts',
  reports: 'Reports & P&L',
  gstReports: 'GST Reports',
  godowns: 'Godowns',
  barcodeLabels: 'Barcode Labels',
  onlineStore: 'Online Store',
  reminders: 'Payment Reminders',
  automatedBills: 'Automated Billing',
  compliance: 'E-Way & E-Invoice / Tally',
  staffRoles: 'Staff & Roles',
  recycleBin: 'Recycle Bin',
  settings: 'Settings',
  save: 'Save',
  cancel: 'Cancel',
};

const HI: Dict = {
  home: 'होम',
  parties: 'पार्टियां',
  items: 'सामान',
  bills: 'बिल',
  more: 'अन्य',
  toCollect: 'लेना है',
  toPay: 'देना है',
  cashBank: 'कैश और बैंक',
  stockValue: 'स्टॉक मूल्य',
  createBill: 'नया बिल',
  sales: 'बिक्री',
  purchases: 'खरीद',
  quotations: 'कोटेशन',
  proforma: 'प्रोफॉर्मा बिल',
  challan: 'डिलीवरी चालान',
  creditNote: 'बिक्री वापसी (CN)',
  debitNote: 'खरीद वापसी (DN)',
  purchaseOrder: 'परचेज ऑर्डर',
  posBilling: 'POS काउंटर',
  expenses: 'खर्चे',
  payments: 'पेमेंट और रसीद',
  reports: 'रिपोर्ट्स और P&L',
  gstReports: 'GST रिपोर्ट्स',
  godowns: 'गोदाम',
  barcodeLabels: 'बारकोड लेबल',
  onlineStore: 'ऑनलाइन स्टोर',
  reminders: 'पेमेंट रिमाइंडर',
  automatedBills: 'ऑटो बिलिंग',
  compliance: 'ई-वे, ई-इनवॉइस / टैली',
  staffRoles: 'स्टाफ और रोल',
  recycleBin: 'रीसायकल बिन',
  settings: 'सेटिंग्स',
  save: 'सेव करें',
  cancel: 'रद्द करें',
};

const HINGLISH: Dict = {
  home: 'Home',
  parties: 'Parties',
  items: 'Items',
  bills: 'Bills',
  more: 'More',
  toCollect: 'Lena Hai',
  toPay: 'Dena Hai',
  cashBank: 'Cash & Bank',
  stockValue: 'Stock Value',
  createBill: 'Naya Bill',
  sales: 'Sales',
  purchases: 'Purchases',
  quotations: 'Quotation / Estimate',
  proforma: 'Proforma Bill',
  challan: 'Delivery Challan',
  creditNote: 'Sales Return (CN)',
  debitNote: 'Purchase Return (DN)',
  purchaseOrder: 'Purchase Order',
  posBilling: 'POS Billing',
  expenses: 'Kharcha (Expenses)',
  payments: 'Payments / Receipts',
  reports: 'Reports & Munafa',
  gstReports: 'GST Reports',
  godowns: 'Godowns / Warehouse',
  barcodeLabels: 'Barcode Stickers',
  onlineStore: 'Online Store',
  reminders: 'Udhaar Reminders',
  automatedBills: 'Auto Recurring Bills',
  compliance: 'E-Way, E-Invoice & Tally',
  staffRoles: 'Staff & Permissions',
  recycleBin: 'Recycle Bin',
  settings: 'Settings',
  save: 'Save Karein',
  cancel: 'Cancel',
};

const MAPS: Record<AppLanguage, Dict> = { en: EN, hi: HI, hinglish: HINGLISH };
const listeners = new Set<() => void>();

export const getAppLanguage = (): AppLanguage => {
  try {
    const val = localStorage.getItem(LANG_KEY);
    if (val === 'en' || val === 'hi' || val === 'hinglish') return val;
  } catch {
    /* ignore */
  }
  return 'en';
};

export const setAppLanguage = (lang: AppLanguage): void => {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn());
};

export const subscribeLanguage = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const t = (key: keyof typeof EN, lang?: AppLanguage): string => {
  const active = lang || getAppLanguage();
  return MAPS[active]?.[key] || EN[key] || String(key);
};
