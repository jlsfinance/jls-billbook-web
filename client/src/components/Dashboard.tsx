import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Barcode, Building2, Calculator, CalendarDays, ChevronDown, FileText, Landmark, Menu, Package, Plus, Receipt, ScanLine, ShoppingBag, TrendingUp, Wallet } from 'lucide-react';
import { HapticService } from '../services/hapticService';
import { StorageService } from '../services/storageService';
import { readDaybook, type DaybookEntry } from '../services/daybook';
import { inReportRange, localDay } from '../services/businessReports';
import { ViewState, type Invoice, type VoucherType } from '../types';
import { formatDate } from '../utils/dateUtils';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { workspace, workspaceMoney } from './WorkspaceUI';

interface DashboardProps {
    onCreateInvoice: () => void;
    onCreateCreditNote: () => void;
    onViewInvoice: (invoice: Invoice) => void;
    onOpenReports: () => void;
    onOpenSmartCalc: () => void;
    onOpenAI: () => void;
    onReceivePayment: () => void;
    onToggleSidebar: () => void;
    onNavigate: (view: ViewState, voucherType?: VoucherType) => void;
}

const periods = [{ id: 'today', label: 'Today', short: 'D' }, { id: 'month', label: 'This month', short: 'M' }, { id: 'all', label: 'All time', short: 'A' }] as const;
type Period = typeof periods[number]['id'];
const types: Record<DaybookEntry['type'], typeof FileText> = {
    sale: FileText, purchase: ShoppingBag, received: ArrowDownLeft, paid: ArrowUpRight, expense: Receipt,
};

function snapshot() {
    const parties = StorageService.getCustomers();
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    const byDate = localDay(soon);
    return {
        entries: readDaybook(),
        collect: parties.reduce((total, party) => total + Math.max(0, Number(party.balance) || 0), 0),
        pay: parties.reduce((total, party) => total + Math.max(0, -Number(party.balance) || 0), 0),
        bank: StorageService.getBankAccounts().reduce((total, account) => total + (Number(account.balance) || 0), 0),
        alerts: StorageService.getProducts().filter(item => !item.isArchived && item.category?.toLowerCase() !== 'services' &&
            (Number(item.stock) <= (item.lowStockThreshold ?? 10) ||
                item.batches?.some(batch => Number(batch.stock) > 0 && batch.expiryDate && batch.expiryDate <= byDate))).length,
        announcements: StorageService.getAdminAds().filter(ad => ad.isActive),
    };
}

export default function Dashboard(props: DashboardProps) {
    const { company, companies, switchCompany, createCompany } = useCompany();
    const { isDemo } = useAuth();
    const { onNavigate } = props;
    const [data, setData] = useState(snapshot);
    const [period, setPeriod] = useState<Period>('today');
    const [businessPanel, setBusinessPanel] = useState<'switch' | 'create' | null>(null);
    const [newName, setNewName] = useState('');
    const [newGstin, setNewGstin] = useState('');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState('');

    useEffect(() => {
        if (company && !company.isLegacy) StorageService.runDueAutomatedBills();
        setData(snapshot());
    }, [company]);

    async function addBusiness(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!newName.trim() || creating) return;
        setCreating(true);
        setCreateError('');
        try {
            await createCompany({ name: newName.trim(), gst: newGstin.trim(), gst_enabled: Boolean(newGstin.trim()) });
            setBusinessPanel(null);
            setNewName('');
            setNewGstin('');
        } catch (error) {
            setCreateError(error instanceof Error ? error.message : 'Unable to create the business.');
        } finally {
            setCreating(false);
        }
    }

    const now = new Date();
    const today = localDay(now);
    const periodStart = period === 'today' ? today : period === 'month' ? today.slice(0, 8) + '01' : '0001-01-01';
    const forPeriod = data.entries.filter(entry => inReportRange(entry.date, periodStart, today));
    const sales = forPeriod.filter(entry => entry.type === 'sale').reduce((sum, entry) => sum + entry.amount, 0);
    const receipts = forPeriod.filter(entry => entry.type === 'received').reduce((sum, entry) => sum + entry.amount, 0);
    const actions = [
        { label: 'New sale', icon: Plus, color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300', action: props.onCreateInvoice },
        { label: 'POS Counter', icon: Receipt, color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300', action: () => onNavigate(ViewState.POS_BILLING) },
        { label: 'Quotation', icon: FileText, color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300', action: () => onNavigate(ViewState.CREATE_VOUCHER, 'QUOTATION') },
        { label: 'Purchase', icon: ShoppingBag, color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300', action: () => onNavigate(ViewState.CREATE_PURCHASE) },
        { label: 'Pay In', icon: ArrowDownLeft, color: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-300', action: props.onReceivePayment },
        { label: 'Cash/Bank', icon: Landmark, color: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-300', action: () => onNavigate(ViewState.CASH_AND_BANK) },
        { label: 'Barcodes', icon: Barcode, color: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300', action: () => onNavigate(ViewState.BARCODE_LABELS) },
        { label: 'Sales bills', icon: Wallet, color: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300', action: () => onNavigate(ViewState.INVOICES) },
    ];
    const balances = [
        { label: 'To collect', value: workspaceMoney(data.collect), icon: ArrowDownLeft, view: ViewState.CUSTOMERS },
        { label: 'To pay', value: workspaceMoney(data.pay), icon: ArrowUpRight, view: ViewState.CUSTOMERS },
        { label: 'Cash & bank', value: workspaceMoney(data.bank), icon: Landmark, view: ViewState.CASH_AND_BANK },
        { label: 'Stock alerts', value: data.alerts, icon: Package, view: ViewState.INVENTORY },
    ];
    const closePanel = () => { if (!creating) { setBusinessPanel(null); setCreateError(''); } };

    return <div className="min-h-full bg-surface-container-low">
        <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
            <div className="mx-auto grid min-h-14 max-w-5xl grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 px-4">
                <button type="button" aria-label="Open navigation" onClick={props.onToggleSidebar}
                    className="grid min-h-11 place-items-center rounded-full text-foreground hover:bg-surface-container-high"><Menu size={22} /></button>
                <h1 className="sr-only">Dashboard</h1>
                <button type="button" aria-label="Switch business" aria-haspopup="dialog" onClick={() => setBusinessPanel('switch')}
                    className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 text-center">
                    <span className="block w-full truncate text-base font-bold">{company?.name || 'My business'}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 text-xs font-semibold text-primary">Switch <ChevronDown size={12} /></span>
                </button>
            </div>
        </header>
        <div className={workspace.page + ' !max-w-5xl'}>
            <section aria-labelledby="dashboard-actions" className="rounded-2xl border border-border bg-card p-3 shadow-sm">
                <h2 id="dashboard-actions" className="mb-2 px-1 text-sm font-semibold">Quick actions</h2>
                <div className="grid grid-cols-4 gap-1 sm:gap-2">
                    {actions.map(action => <button type="button" key={action.label}
                        onClick={() => { HapticService.light(); action.action(); }}
                        className="flex min-h-[4.25rem] min-w-0 flex-col items-center justify-center rounded-2xl px-0.5 py-1.5 text-center hover:bg-surface-container-high focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95">
                        <span className={`mb-1.5 grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${action.color}`}><action.icon size={19} /></span>
                        <span className="text-[11px] font-semibold leading-tight">{action.label}</span>
                    </button>)}
                </div>
            </section>

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                <section aria-labelledby="dashboard-sales" className="min-w-0 rounded-2xl bg-tertiary-container p-2.5 text-on-tertiary-container sm:p-3">
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <h2 id="dashboard-sales" className="flex items-center gap-1.5 text-xs font-semibold"><TrendingUp size={15} className="hidden min-[430px]:block" /> Net sales</h2>
                        <div role="group" aria-label="Sales period" className="flex gap-0.5 rounded-full bg-on-tertiary-container/10 p-0.5">
                            {periods.map(option => <button type="button" key={option.id} aria-label={option.label} aria-pressed={period === option.id} onClick={() => setPeriod(option.id)}
                                className={`min-h-7 min-w-7 rounded-full text-[11px] font-semibold focus-visible:ring-2 focus-visible:ring-current ${period === option.id ? 'bg-on-tertiary-container text-tertiary-container' : 'hover:bg-on-tertiary-container/10'}`}>
                                {option.short}
                            </button>)}
                        </div>
                    </div>
                    <p data-testid="dashboard-sales-total" className="mt-1 break-words text-lg font-bold leading-tight tabular-nums sm:text-xl">{workspaceMoney(sales)}</p>
                    <button type="button" onClick={props.onOpenReports} className="mt-0.5 inline-flex min-h-6 items-center gap-1 text-xs font-semibold">Reports <ArrowRight size={12} /></button>
                </section>
                <button type="button" onClick={() => onNavigate(ViewState.PAYMENTS)}
                    className="min-w-0 rounded-2xl bg-primary-container p-2.5 text-left text-on-primary-container hover:brightness-95 focus-visible:ring-2 focus-visible:ring-primary/40 sm:p-3">
                    <span className="flex items-center gap-1.5 text-xs font-semibold"><ArrowDownLeft size={15} /> Receipts recorded</span>
                    <span className="mt-1 block break-words text-lg font-bold leading-tight tabular-nums sm:text-xl">{workspaceMoney(receipts)}</span>
                    <span className="mt-0.5 inline-flex min-h-6 items-center gap-1 text-xs font-semibold">Payments <ArrowRight size={12} /></span>
                </button>
            </div>

            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Current business balances">
                {balances.map(balance => <button type="button" key={balance.label} onClick={() => onNavigate(balance.view)}
                    className={workspace.panel + ' min-w-0 p-3 text-left hover:bg-surface-container-high focus-visible:ring-2 focus-visible:ring-primary/40'}>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><balance.icon size={15} className="shrink-0 text-primary" />{balance.label}</span>
                    <span className="mt-1 block break-words font-heading text-base font-bold tabular-nums sm:text-xl">{balance.value}</span>
                </button>)}
            </section>

            <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
                <section aria-labelledby="dashboard-activity" className={workspace.panel + ' min-w-0 overflow-hidden'}>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5 sm:px-4">
                        <h2 id="dashboard-activity" className="text-sm font-bold">Recent transactions</h2>
                        <button type="button" onClick={() => onNavigate(ViewState.DAYBOOK)} className={workspace.secondary + ' !min-h-9 !px-2.5 !text-xs'}>Open Daybook <ArrowRight size={14} /></button>
                    </div>
                    {forPeriod.length ? <ul className="divide-y divide-border">
                        {forPeriod.slice(0, 6).map(entry => {
                            const Icon = types[entry.type];
                            return <li key={entry.id}>
                                <button type="button" onClick={() => entry.invoice ? props.onViewInvoice(entry.invoice) : onNavigate(ViewState.DAYBOOK)}
                                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-container-high sm:gap-3 sm:px-4">
                                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon size={15} /></span>
                                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{entry.name}</span><span className="block truncate text-xs text-muted-foreground">{entry.label} · {entry.reference || formatDate(entry.date)}</span></span>
                                    <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{workspaceMoney(entry.amount)}</span>
                                </button>
                            </li>;
                        })}
                    </ul> : <p className="px-4 py-8 text-center text-sm text-muted-foreground">No transactions in this period.</p>}
                </section>
                <div className="min-w-0 space-y-3">
                    <section className={workspace.panel + ' p-3 sm:p-4'} aria-label="Business tools">
                        <h2 className="text-sm font-bold">Business tools</h2>
                        <div className="mt-2 grid gap-1.5">
                            <button type="button" onClick={props.onOpenReports} className={workspace.secondary + ' justify-between'}><span className="flex items-center gap-2"><CalendarDays size={16} /> Reports &amp; GST</span><ArrowRight size={15} /></button>
                            <button type="button" onClick={props.onOpenAI} className={workspace.secondary + ' justify-between'}><span className="flex items-center gap-2"><ScanLine size={16} /> Scan bill</span><ArrowRight size={15} /></button>
                            <button type="button" onClick={props.onOpenSmartCalc} className={workspace.secondary + ' justify-between'}><span className="flex items-center gap-2"><Calculator size={16} /> Smart calculator</span><ArrowRight size={15} /></button>
                            <button type="button" onClick={props.onCreateCreditNote} className={workspace.secondary + ' justify-between'}><span className="flex items-center gap-2"><ArrowUpRight size={16} /> Sales return</span><ArrowRight size={15} /></button>
                            <button type="button" onClick={() => onNavigate(ViewState.MORE_HUB)} className={workspace.secondary + ' justify-between'}><span className="flex items-center gap-2"><Wallet size={16} /> All business tools</span><ArrowRight size={15} /></button>
                        </div>
                    </section>
                    {!!data.announcements.length && <section className={workspace.panel + ' divide-y divide-border'} aria-label="Business updates">
                        {data.announcements.slice(0, 3).map(ad => <article key={ad.id} className="break-words p-3 sm:p-4">
                            <h3 className="text-sm font-bold">{ad.title}</h3><p className="mt-1 text-xs text-muted-foreground">{ad.content}</p>
                            {ad.actionUrl && /^https?:\/\//i.test(ad.actionUrl) && <a href={ad.actionUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-primary">{ad.buttonText || 'Open update'}</a>}
                        </article>)}
                    </section>}
                </div>
            </div>
        </div>

        <Dialog open={businessPanel !== null} onOpenChange={open => { if (!open) closePanel(); }}>
            <DialogContent className="max-w-md rounded-2xl" onEscapeKeyDown={event => { if (creating) event.preventDefault(); }}>
                <DialogHeader>
                    <DialogTitle>{businessPanel === 'create' ? 'Add business' : 'Switch business'}</DialogTitle>
                    <DialogDescription>{businessPanel === 'create' ? 'Enter the business details.' : 'Choose the business you want to work in.'}</DialogDescription>
                </DialogHeader>
                {businessPanel === 'switch' && <div className="space-y-2">
                    <ul className="max-h-[50dvh] space-y-1 overflow-auto">
                        {companies.map(item => <li key={item.id}>
                            <button type="button" aria-current={item.id === company?.id ? 'true' : undefined} className={workspace.secondary + ' w-full justify-start text-left'} onClick={() => {
                                closePanel();
                                if (item.id !== company?.id) switchCompany(item.id);
                            }}><Building2 size={16} className="shrink-0 text-primary" /><span className="min-w-0 flex-1 break-words">{item.name}</span>{item.id === company?.id && <span className="text-xs text-muted-foreground">Current</span>}</button>
                        </li>)}
                    </ul>
                    {!isDemo && <button type="button" className={workspace.primary} onClick={() => setBusinessPanel('create')}><Plus size={17} /> Add business</button>}
                </div>}
                {businessPanel === 'create' && <form onSubmit={addBusiness} className="space-y-3">
                    <label className="block space-y-1.5 text-sm">Business name<input className={workspace.input} value={newName} required onChange={event => setNewName(event.target.value)} /></label>
                    <label className="block space-y-1.5 text-sm">GSTIN <span className="text-muted-foreground">(optional)</span><input className={workspace.input} value={newGstin} onChange={event => setNewGstin(event.target.value.toUpperCase())} /></label>
                    {createError && <p role="alert" className="text-sm text-red-600">{createError}</p>}
                    <div className="flex justify-end gap-2">
                        <button type="button" className={workspace.secondary} disabled={creating} onClick={() => setBusinessPanel('switch')}>Back</button>
                        <button type="submit" className={workspace.primary} disabled={creating || !newName.trim()}>{creating ? 'Creating…' : 'Create business'}</button>
                    </div>
                </form>}
            </DialogContent>
        </Dialog>
    </div>;
}
