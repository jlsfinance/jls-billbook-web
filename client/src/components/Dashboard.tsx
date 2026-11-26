import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Barcode, Building2, Calculator, CalendarDays, ChevronDown, FileText, Landmark, Menu, Package, Plus, Receipt, ScanLine, ShoppingBag, Wallet } from 'lucide-react';
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

const periods = [{ id: 'today', label: 'Today' }, { id: 'month', label: 'This month' }, { id: 'all', label: 'All time' }] as const;
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
    const [period, setPeriod] = useState<Period>('month');
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
    const dailySales = new Map<string, number>();
    for (const entry of data.entries) {
        if (entry.type !== 'sale') continue;
        const day = entry.date.slice(0, 10);
        dailySales.set(day, (dailySales.get(day) || 0) + entry.amount);
    }
    const week = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index);
        const day = localDay(date);
        return { day, label: new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(date), sales: dailySales.get(day) || 0 };
    });
    const peak = Math.max(...week.map(day => Math.abs(day.sales)), 1);
    const actions = [
        { label: 'POS Counter', icon: Barcode, action: () => onNavigate(ViewState.POS_BILLING) },
        { label: 'Sales bills', icon: FileText, action: () => onNavigate(ViewState.INVOICES) },
        { label: 'Purchase bill', icon: ShoppingBag, action: () => onNavigate(ViewState.CREATE_PURCHASE) },
        { label: 'Receive payment', icon: ArrowDownLeft, action: props.onReceivePayment },
        { label: 'Quotation', icon: FileText, action: () => onNavigate(ViewState.CREATE_VOUCHER, 'QUOTATION') },
        { label: 'Sales return', icon: ArrowUpRight, action: props.onCreateCreditNote },
        { label: 'Scan bill', icon: ScanLine, action: props.onOpenAI },
        { label: 'Smart calculator', icon: Calculator, action: props.onOpenSmartCalc },
    ];
    const balances = [
        { label: 'To collect', value: workspaceMoney(data.collect), icon: ArrowDownLeft, view: ViewState.CUSTOMERS },
        { label: 'To pay', value: workspaceMoney(data.pay), icon: ArrowUpRight, view: ViewState.CUSTOMERS },
        { label: 'Cash & bank', value: workspaceMoney(data.bank), icon: Landmark, view: ViewState.CASH_AND_BANK },
        { label: 'Stock alerts', value: data.alerts, icon: Package, view: ViewState.INVENTORY },
    ];
    const closePanel = () => { if (!creating) { setBusinessPanel(null); setCreateError(''); } };

    return <div className="min-h-full bg-surface-container-low">
        <div className={workspace.page}>
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <button type="button" aria-label="Open navigation" onClick={props.onToggleSidebar} className={workspace.secondary + ' w-11 shrink-0 !px-0 md:hidden'}><Menu size={19} /></button>
                    <div className="min-w-0">
                        <h1 className="font-heading text-2xl font-bold leading-tight tracking-tight sm:text-3xl">Dashboard</h1>
                        <button type="button" aria-label="Switch business" aria-haspopup="dialog" onClick={() => setBusinessPanel('switch')} className="mt-1 inline-flex max-w-full items-center gap-1 text-left text-sm text-muted-foreground hover:text-foreground">
                            <span className="truncate">{company?.name || 'My business'}</span><ChevronDown size={15} className="shrink-0" />
                        </button>
                    </div>
                </div>
                <button type="button" onClick={props.onCreateInvoice} className={workspace.primary + ' shrink-0'}><Plus size={18} /> New sale</button>
            </header>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                <section aria-labelledby="dashboard-sales" className="min-w-0 rounded-3xl bg-[#123377] p-4 text-white sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 id="dashboard-sales" className="text-sm font-semibold text-blue-100">Net sales</h2>
                        <div role="group" aria-label="Sales period" className="flex max-w-full gap-1 rounded-xl bg-[#0c2867] p-1">
                            {periods.map(option => <button type="button" key={option.id} aria-pressed={period === option.id} onClick={() => setPeriod(option.id)}
                                className={`min-h-8 rounded-lg px-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-white ${period === option.id ? 'bg-white text-[#102f70]' : 'text-blue-100 hover:bg-white/10'}`}>{option.label}</button>)}
                        </div>
                    </div>
                    <p data-testid="dashboard-sales-total" className="mt-2 break-words font-heading text-[clamp(1.75rem,7vw,2.75rem)] font-bold leading-tight tabular-nums">{workspaceMoney(sales)}</p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-blue-100">
                        <span>After sales returns</span>
                        <span>Receipts recorded <strong className="ml-1 font-semibold tabular-nums text-white">{workspaceMoney(receipts)}</strong></span>
                    </div>
                    <div className="mt-5 border-t border-white/20 pt-3">
                        <p className="text-xs font-medium text-blue-100">Net sales · Last 7 days</p>
                        <ul className="mt-1 grid grid-cols-7 gap-2" aria-label="Net sales for the last seven days">
                            {week.map(point => <li key={point.day} title={`${formatDate(point.day)} · ${workspaceMoney(point.sales)}`} className="grid min-w-0 justify-items-center gap-1">
                                <span className="sr-only">{formatDate(point.day)} {workspaceMoney(point.sales)}</span>
                                <div aria-hidden="true" className="flex h-10 w-full items-end rounded-sm bg-white/5">
                                    <span style={{ height: `${Math.max(4, Math.abs(point.sales) / peak * 100)}%` }} className={`w-full rounded-sm ${point.sales < 0 ? 'bg-orange-300' : point.sales > 0 ? 'bg-blue-300' : 'bg-blue-100/30'}`} />
                                </div>
                                <span aria-hidden="true" className="text-[10px] text-blue-100">{point.label}</span>
                            </li>)}
                        </ul>
                    </div>
                </section>
                <section aria-labelledby="dashboard-actions" className={workspace.panel + ' p-3 sm:p-4'}>
                    <h2 id="dashboard-actions" className="px-1 pb-1.5 text-sm font-bold">Quick actions</h2>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2">
                        {actions.map(action => <button type="button" key={action.label} onClick={action.action}
                            className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-border px-2 py-1.5 text-left text-xs font-semibold hover:bg-surface-container-high focus-visible:ring-2 focus-visible:ring-primary/40">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><action.icon size={15} /></span><span className="min-w-0 break-words">{action.label}</span>
                        </button>)}
                    </div>
                </section>
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
                            <button type="button" onClick={() => onNavigate(ViewState.BARCODE_LABELS)} className={workspace.secondary + ' justify-between'}><span className="flex items-center gap-2"><Barcode size={16} /> Barcode labels</span><ArrowRight size={15} /></button>
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
