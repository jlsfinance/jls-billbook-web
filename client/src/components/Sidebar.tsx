
import React from 'react';
import { ViewState } from '../types';
import {
  LayoutDashboard, FileText, Users, Package, Settings, Sun, Moon, X, RotateCcw,
  ShoppingCart, BarChart3, ArrowDownLeft, Calculator, Cloud, ScanLine, Landmark,
  Warehouse, ScanBarcode, Store, BellRing, Repeat, ShieldCheck, UserCog, Trash2, Receipt, FileDown, Gift
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { HapticService } from '@/services/hapticService';

interface SidebarProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  isOpen: boolean;
  onClose: () => void;
  isCloudConnected: boolean;
  onOpenBackup?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, isOpen, onClose, isCloudConnected, onOpenBackup }) => {
  const { theme, setTheme } = useTheme();

  const navItems = [
    {
      section: 'Sales & Billing', items: [
        { id: ViewState.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
        { id: ViewState.POS_BILLING, label: 'POS Counter', icon: Receipt },
        { id: ViewState.INVOICES, label: 'Sales Invoices', icon: FileText },
        { id: ViewState.QUOTATIONS, label: 'Quotations', icon: FileText },
        { id: ViewState.PROFORMA_INVOICES, label: 'Proforma Invoices', icon: FileText },
        { id: ViewState.DELIVERY_CHALLANS, label: 'Delivery Challans', icon: FileText },
        { id: ViewState.CREATE_CREDIT_NOTE, label: 'Return (CN)', icon: RotateCcw },
      ]
    },
    {
      section: 'Purchases & Costs', items: [
        { id: ViewState.PURCHASES, label: 'Purchases', icon: ShoppingCart },
        { id: ViewState.PURCHASE_ORDERS, label: 'Purchase Orders', icon: ShoppingCart },
        { id: ViewState.DEBIT_NOTES, label: 'Debit Notes', icon: RotateCcw },
        { id: ViewState.EXPENSES, label: 'Expenses', icon: Receipt },
      ]
    },
    {
      section: 'Parties & Inventory', items: [
        { id: ViewState.CUSTOMERS, label: 'Parties / Khata', icon: Users },
        { id: ViewState.INVENTORY, label: 'Items & Stock', icon: Package },
        { id: ViewState.GODOWNS, label: 'Godowns', icon: Warehouse },
        { id: ViewState.BARCODE_LABELS, label: 'Barcode Labels', icon: ScanBarcode },
        { id: ViewState.STOCK_IN, label: 'Stock In', icon: ScanLine },
      ]
    },
    {
      section: 'Cash, Bank & Growth', items: [
        { id: ViewState.CASH_AND_BANK, label: 'Cash & Bank', icon: Landmark },
        { id: ViewState.PAYMENTS, label: 'Receipts / Pay Out', icon: ArrowDownLeft },
        { id: ViewState.PAYMENT_REMINDERS, label: 'Pay Reminders', icon: BellRing },
        { id: ViewState.AUTOMATED_BILLS, label: 'Automated Bills', icon: Repeat },
        { id: ViewState.ONLINE_STORE, label: 'Online Dukaan', icon: Store },
        { id: ViewState.CUSTOMER_ENGAGEMENT, label: 'Loyalty & Campaigns', icon: Gift },
        { id: ViewState.DAYBOOK, label: 'Daybook', icon: ArrowDownLeft },
        { id: ViewState.SMART_CALCULATOR, label: 'Smart Calc', icon: Calculator },
      ]
    },
    {
      section: 'Reports & Admin', items: [
        { id: ViewState.REPORTS, label: 'Reports & GST', icon: BarChart3 },
        { id: ViewState.ACCOUNTANT_EXPORT, label: 'Accountant Export', icon: FileDown },
        { id: ViewState.COMPLIANCE_CENTER, label: 'E-Invoice / Tally', icon: ShieldCheck },
        { id: ViewState.STAFF_ROLES, label: 'Staff & Roles', icon: UserCog },
        { id: ViewState.RECYCLE_BIN, label: 'Recycle Bin', icon: Trash2 },
        { id: ViewState.SETTINGS, label: 'Settings', icon: Settings },
      ]
    },
    {
      section: 'Cloud', items: [
        { id: 'BACKUP' as any, label: 'Backup & Sync', icon: Cloud, isSpecial: true },
      ]
    }
  ];

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity lg:hidden ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <aside className={`fixed top-0 left-0 h-full w-[280px] bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 z-50 transition-transform duration-300 transform lg:transform-none lg:static pt-safe ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100 dark:border-slate-800">
            <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter italic">JLS Bill</h1>
            <button onClick={onClose} className="lg:hidden p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-900">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Nav Items */}
          <div className="flex-1 overflow-y-auto py-6 px-4 space-y-8">
            {navItems.map((group, idx) => (
              <div key={idx}>
                <h3 className="px-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">{group.section}</h3>
                <div className="space-y-1">
                  {group.items.map((item: any) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        HapticService.light();
                        if (item.isSpecial && onOpenBackup) {
                          onOpenBackup();
                          onClose();
                        } else {
                          onNavigate(item.id);
                          onClose();
                        }
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm ${item.isSpecial
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 border border-green-200 dark:border-green-800'
                        : currentView === item.id
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900'
                        }`}
                    >
                      <item.icon className="w-5 h-5" strokeWidth={currentView === item.id ? 2.5 : 2} />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-100 dark:bg-slate-800">
              <div className={`w-2 h-2 rounded-full ${isCloudConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                {isCloudConnected ? 'Cloud Sync Active' : 'Sync Paused'}
              </span>
            </div>

            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-sm font-bold text-slate-600 dark:text-slate-300"
            >
              <span>Appearance</span>
              {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>

            <div className="pt-2 pb-1 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center justify-center gap-1.5">
                Made with <span className="text-red-500 animate-pulse text-xs">❤️</span> by Lavneet
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
