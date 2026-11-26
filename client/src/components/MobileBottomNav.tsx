
import React from 'react';
import { ViewState, type VoucherType } from '../types';
import { LayoutDashboard, Plus, Users, Package, LayoutGrid, ArrowDownLeft, ArrowUpRight, FileText, Receipt, RotateCcw, ShoppingBag, Truck } from 'lucide-react';
import { motion } from 'framer-motion';
import { HapticService } from '@/services/hapticService';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';

export type QuickCreateAction = VoucherType | 'RECEIVED' | 'PAID' | 'POS';

const quickActions = [
  { value: 'SALE', label: 'Sales invoice', icon: Receipt },
  { value: 'PURCHASE', label: 'Purchase bill', icon: ShoppingBag },
  { value: 'RECEIVED', label: 'Receive payment', icon: ArrowDownLeft },
  { value: 'PAID', label: 'Record payment out', icon: ArrowUpRight },
  { value: 'QUOTATION', label: 'Quotation', icon: FileText },
  { value: 'PROFORMA', label: 'Proforma invoice', icon: FileText },
  { value: 'DELIVERY_CHALLAN', label: 'Delivery challan', icon: Truck },
  { value: 'PURCHASE_ORDER', label: 'Purchase order', icon: ShoppingBag },
  { value: 'CREDIT_NOTE', label: 'Credit note', icon: RotateCcw },
  { value: 'DEBIT_NOTE', label: 'Debit note', icon: RotateCcw },
  { value: 'POS', label: 'POS counter', icon: Receipt },
] as const;

interface MobileBottomNavProps {
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
  onCreateAction: (action: QuickCreateAction) => void;
}

const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ currentView, onChangeView, onCreateAction }) => {
  const [open, setOpen] = React.useState(false);

  return (
    <nav aria-label="Main navigation" className="lg:hidden fixed bottom-0 left-0 right-0 bg-surface-container/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-border/60 pb-safe z-40">
      <div className="flex justify-around items-center px-2 max-w-lg mx-auto py-2">
        <NavButton
          active={currentView === ViewState.DASHBOARD}
          onClick={() => onChangeView(ViewState.DASHBOARD)}
          icon={LayoutDashboard}
          label="Dashboard"
        />
        <NavButton
          active={currentView === ViewState.CUSTOMERS}
          onClick={() => onChangeView(ViewState.CUSTOMERS)}
          icon={Users}
          label="Parties"
        />
        <div className="flex flex-col items-center -mt-5">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <motion.button type="button" aria-label="Create a bill or payment" whileTap={{ scale: 0.9 }} onClick={() => HapticService.medium()}
                className="w-12 h-12 rounded-2xl bg-google-blue text-white shadow-lg shadow-blue-500/30 flex items-center justify-center">
                <Plus className="w-6 h-6" strokeWidth={3} />
              </motion.button>
            </DialogTrigger>
            <DialogContent className="bottom-0 top-auto max-h-[85dvh] w-full max-w-none translate-y-0 overflow-y-auto rounded-t-3xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:bottom-5 sm:max-w-lg sm:rounded-3xl">
              <DialogHeader>
                <DialogTitle>New transaction</DialogTitle>
                <DialogDescription>Choose a bill, payment or POS checkout.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2">
                {quickActions.map(({ value, label, icon: Icon }) => (
                  <button key={value} type="button" onClick={() => { setOpen(false); onCreateAction(value); }}
                    className="flex min-h-12 items-center gap-2 rounded-xl border px-2.5 py-2 text-start text-sm font-medium hover:bg-accent">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon size={17} /></span> {label}
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>
          <span className="text-[10px] font-bold text-google-blue mt-0.5">+ Bill</span>
        </div>
        <NavButton
          active={currentView === ViewState.INVENTORY}
          onClick={() => onChangeView(ViewState.INVENTORY)}
          icon={Package}
          label="Items"
        />
        <NavButton
          active={currentView === ViewState.MORE_HUB}
          onClick={() => onChangeView(ViewState.MORE_HUB)}
          icon={LayoutGrid}
          label="More"
        />
      </div>
    </nav>
  );
};

const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: any; label: string }> = ({ active, onClick, icon: Icon, label }) => (
  <button
    type="button"
    aria-current={active ? 'page' : undefined}
    onClick={() => {
      HapticService.light();
      onClick();
    }}
    className="flex flex-col items-center justify-center flex-1 h-full group"
  >
    <div className="relative flex items-center justify-center w-14 h-8 rounded-full mb-0.5 transition-all duration-300">
      {active && (
        <motion.div
          layoutId="nav-pill"
          className="absolute inset-0 bg-primary/20 dark:bg-primary/30 rounded-full"
          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
        />
      )}
      <Icon className={`w-5 h-5 relative z-10 ${active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} strokeWidth={active ? 2.5 : 2} />
    </div>
    <span className={`text-[10px] font-bold tracking-tight transition-colors ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
      {label}
    </span>
  </button>
);

export default MobileBottomNav;
