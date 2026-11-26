import React, { useState } from 'react';
import {
  FileText, ShoppingBag, Receipt, RotateCcw, Landmark, Warehouse, ScanBarcode,
  Store, BellRing, Repeat, ShieldCheck, UserCog, Trash2, BarChart3, Settings, Calculator, Languages, FileDown, Gift, Search, ArrowUpRight, BookOpen, PackagePlus
} from 'lucide-react';
import { ViewState, VoucherType } from '../types';
import { AppLanguage, getAppLanguage, setAppLanguage } from '../services/i18n';
import { WorkspaceHeading, workspace } from './WorkspaceUI';

interface MoreHubProps {
  onNavigate: (view: ViewState, voucherType?: VoucherType) => void;
}

export const MoreHub: React.FC<MoreHubProps> = ({ onNavigate }) => {
  const [lang, setLang] = useState<AppLanguage>(() => getAppLanguage());
  const [search, setSearch] = useState('');

  const handleLangChange = (next: AppLanguage) => {
    setAppLanguage(next);
    setLang(next);
  };

  const groups = [
    {
      title: 'Sales & Billing Documents',
      items: [
        { label: 'POS Counter', icon: Receipt, color: 'bg-blue-50 text-blue-600', onClick: () => onNavigate(ViewState.POS_BILLING) },
        { label: 'Sales Invoices', icon: FileText, color: 'bg-blue-50 text-blue-700', onClick: () => onNavigate(ViewState.INVOICES) },
        { label: 'Quotations / Est.', icon: FileText, color: 'bg-indigo-50 text-indigo-600', onClick: () => onNavigate(ViewState.QUOTATIONS) },
        { label: 'Proforma Invoice', icon: FileText, color: 'bg-cyan-50 text-cyan-600', onClick: () => onNavigate(ViewState.PROFORMA_INVOICES) },
        { label: 'Delivery Challan', icon: FileText, color: 'bg-teal-50 text-teal-600', onClick: () => onNavigate(ViewState.DELIVERY_CHALLANS) },
        { label: 'Credit Note', icon: RotateCcw, color: 'bg-orange-50 text-orange-600', onClick: () => onNavigate(ViewState.CREATE_CREDIT_NOTE) },
        { label: 'Automated Bills', icon: Repeat, color: 'bg-violet-50 text-violet-600', onClick: () => onNavigate(ViewState.AUTOMATED_BILLS) },
      ],
    },
    {
      title: 'Purchases & Stock',
      items: [
        { label: 'Purchase Orders', icon: ShoppingBag, color: 'bg-amber-50 text-amber-600', onClick: () => onNavigate(ViewState.PURCHASE_ORDERS) },
        { label: 'Purchase Bills', icon: ShoppingBag, color: 'bg-orange-50 text-orange-700', onClick: () => onNavigate(ViewState.PURCHASES) },
        { label: 'Stock In', icon: PackagePlus, color: 'bg-violet-50 text-violet-700', onClick: () => onNavigate(ViewState.STOCK_IN) },
        { label: 'Debit Notes', icon: RotateCcw, color: 'bg-rose-50 text-rose-600', onClick: () => onNavigate(ViewState.DEBIT_NOTES) },
        { label: 'Godowns', icon: Warehouse, color: 'bg-indigo-50 text-indigo-600', onClick: () => onNavigate(ViewState.GODOWNS) },
        { label: 'Barcode Labels', icon: ScanBarcode, color: 'bg-purple-50 text-purple-600', onClick: () => onNavigate(ViewState.BARCODE_LABELS) },
        { label: 'Expenses', icon: Receipt, color: 'bg-red-50 text-red-600', onClick: () => onNavigate(ViewState.EXPENSES) },
        { label: 'Smart Calc', icon: Calculator, color: 'bg-emerald-50 text-emerald-600', onClick: () => onNavigate(ViewState.SMART_CALCULATOR) },
      ],
    },
    {
      title: 'Accounting, Compliance & Growth',
      items: [
        { label: 'Cash & Bank', icon: Landmark, color: 'bg-emerald-50 text-emerald-600', onClick: () => onNavigate(ViewState.CASH_AND_BANK) },
        { label: 'Payments In & Out', icon: ArrowUpRight, color: 'bg-teal-50 text-teal-700', onClick: () => onNavigate(ViewState.PAYMENTS) },
        { label: 'Daybook', icon: BookOpen, color: 'bg-violet-50 text-violet-700', onClick: () => onNavigate(ViewState.DAYBOOK) },
        { label: 'E-Invoice / Tally', icon: ShieldCheck, color: 'bg-indigo-50 text-indigo-600', onClick: () => onNavigate(ViewState.COMPLIANCE_CENTER) },
        { label: 'Reports & GST', icon: BarChart3, color: 'bg-blue-50 text-blue-600', onClick: () => onNavigate(ViewState.REPORTS) },
        { label: 'Accountant Export', icon: FileDown, color: 'bg-sky-50 text-sky-700', onClick: () => onNavigate(ViewState.ACCOUNTANT_EXPORT) },
        { label: 'Loyalty & Campaigns', icon: Gift, color: 'bg-pink-50 text-pink-700', onClick: () => onNavigate(ViewState.CUSTOMER_ENGAGEMENT) },
        { label: 'Pay Reminders', icon: BellRing, color: 'bg-green-50 text-green-600', onClick: () => onNavigate(ViewState.PAYMENT_REMINDERS) },
        { label: 'Online Dukaan', icon: Store, color: 'bg-teal-50 text-teal-600', onClick: () => onNavigate(ViewState.ONLINE_STORE) },
        { label: 'Staff & Roles', icon: UserCog, color: 'bg-purple-50 text-purple-600', onClick: () => onNavigate(ViewState.STAFF_ROLES) },
        { label: 'Recycle Bin', icon: Trash2, color: 'bg-rose-50 text-rose-600', onClick: () => onNavigate(ViewState.RECYCLE_BIN) },
        { label: 'Settings', icon: Settings, color: 'bg-slate-100 text-slate-600', onClick: () => onNavigate(ViewState.SETTINGS) },
      ],
    },
  ];
  const query = search.trim().toLowerCase();
  const matchingGroups = groups.map(group => ({
    ...group,
    items: group.title.toLowerCase().includes(query) ? group.items : group.items.filter(item => item.label.toLowerCase().includes(query)),
  })).filter(group => group.items.length > 0);

  return (
    <div className="min-h-screen bg-surface-container-low">
      <div className={workspace.page}>
        <WorkspaceHeading title="Business tools" />
        <label className={workspace.input + ' flex items-center gap-2'}>
            <Search size={18} aria-hidden="true" className="shrink-0 text-muted-foreground" />
            <input type="search" aria-label="Search business tools" placeholder="Search tools" value={search} onChange={event => setSearch(event.target.value)}
              className="w-full bg-transparent text-sm outline-none" />
        </label>
        {matchingGroups.length === 0 && <p role="status" className="rounded-xl border bg-card p-4 text-sm">No tools found for “{search.trim()}”.</p>}
        {matchingGroups.map((grp) => (
          <section key={grp.title} className={workspace.panel + ' p-3 sm:p-4'}>
            <h2 className="text-sm font-semibold mb-2 px-1">{grp.title}</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {grp.items.map((item) => (
                <button key={item.label} type="button" onClick={item.onClick}
                  className="min-h-20 rounded-xl border border-transparent hover:border-border hover:bg-accent flex flex-col items-center justify-center text-center gap-1.5 px-1.5">
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${item.color}`}><item.icon className="w-[18px] h-[18px]" /></span>
                  <span className="text-xs font-medium leading-tight">{item.label}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
        {!query && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Languages className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-sm font-black">App Language</h2>
              <p className="text-[11px] text-slate-500">Switch between English, Hindi &amp; Hinglish</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            {([
              { id: 'en', label: 'English' },
              { id: 'hi', label: 'हिंदी' },
              { id: 'hinglish', label: 'Hinglish' },
            ] as { id: AppLanguage; label: string }[]).map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => handleLangChange(l.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                  lang === l.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>)}
      </div>
    </div>
  );
};

export default MoreHub;
