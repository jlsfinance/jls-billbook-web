import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, BookOpen, ChevronRight, Download, FileText, Receipt } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { StorageService } from '../services/storageService';
import { inReportRange, localDay } from '../services/businessReports';
import { formatDate } from '../utils/dateUtils';
import type { Invoice } from '../types';
import { WorkspaceFilters, WorkspaceHeading, WorkspaceMetrics, workspace, workspaceMoney } from './WorkspaceUI';

const filters = [
    { id: 'all', label: 'All entries' }, { id: 'sale', label: 'Sales' }, { id: 'purchase', label: 'Purchases' },
    { id: 'received', label: 'Money in' }, { id: 'paid', label: 'Money out' }, { id: 'expense', label: 'Expenses' },
] as const;
type Filter = typeof filters[number]['id'];
type Entry = {
    id: string; date: string; label: string; type: Exclude<Filter, 'all'>; name: string;
    reference: string; amount: number; partyId?: string; invoice?: Invoice;
};

function readDaybook(): Entry[] {
    const parties = new Map(StorageService.getCustomers().map(party => [party.id, party.company || party.name]));
    const voucherRow = (invoice: Invoice, type: 'sale' | 'purchase', label: string, sign = 1): Entry => ({
        id: `${type}:${invoice.id}`, date: invoice.date, type, label, name: invoice.customerName || 'Walk-in',
        reference: invoice.invoiceNumber, amount: sign * Math.abs(Number(invoice.total) || 0), partyId: invoice.customerId, invoice,
    });
    const vouchers = [
        ...StorageService.getInvoices().map(invoice => invoice.type === 'CREDIT_NOTE'
            ? voucherRow(invoice, 'sale', 'Sales return', -1) : voucherRow(invoice, 'sale', 'Sale')),
        ...StorageService.getPurchases().map(invoice => voucherRow(invoice, 'purchase', 'Purchase')),
        ...StorageService.getVouchersByType('DEBIT_NOTE').map(invoice => voucherRow(invoice, 'purchase', 'Purchase return', -1)),
    ].filter(row => row.invoice?.conversionStatus !== 'CANCELLED');
    const payments = StorageService.getPayments().map((payment): Entry => {
        const outgoing = payment.type === 'PAID';
        const status = payment.mode === 'CHEQUE' && payment.chequeStatus && payment.chequeStatus !== 'CLEARED'
            ? ` · Cheque ${payment.chequeStatus.toLowerCase()}` : '';
        return { id: `payment:${payment.id}`, date: payment.date, type: outgoing ? 'paid' : 'received',
            label: (outgoing ? 'Payment out' : 'Payment in') + status, name: parties.get(payment.customerId) || 'Walk-in',
            reference: payment.reference || payment.invoiceNumber || payment.mode.replace(/_/g, ' '),
            amount: Number(payment.amount) || 0, partyId: payment.customerId };
    });
    const expenses = StorageService.getExpenses().map((expense): Entry => ({
        id: `expense:${expense.id}`, date: expense.date, label: 'Expense', type: 'expense',
        name: expense.description || expense.category, reference: expense.invoiceRef || expense.category, amount: Number(expense.amount) || 0,
    }));
    return [...vouchers, ...payments, ...expenses].sort((a, b) => b.date.localeCompare(a.date));
}

export default function Daybook({ initialDate, onViewCustomerLedger, onViewInvoice }: {
    initialDate?: string | null; onViewCustomerLedger?: (customerId: string) => void; onViewInvoice?: (invoice: Invoice) => void;
}) {
    const [from, setFrom] = useState(() => initialDate || localDay());
    const [to, setTo] = useState(() => initialDate || localDay());
    const [type, setType] = useState<Filter>('all');
    const [query, setQuery] = useState('');
    const [exportError, setExportError] = useState(false);
    const valid = Boolean(from && to && from <= to);
    const inPeriod = valid ? readDaybook().filter(entry => inReportRange(entry.date, from, to)) : [];
    const search = query.trim().toLowerCase();
    const visible = inPeriod.filter(entry => (type === 'all' || entry.type === type) &&
        (!search || `${entry.name} ${entry.reference} ${entry.label}`.toLowerCase().includes(search)));
    const sum = (kind: Entry['type']) => inPeriod.filter(entry => entry.type === kind).reduce((total, entry) => total + entry.amount, 0);
    const grouped = new Map<string, Entry[]>();
    for (const entry of visible) {
        const day = entry.date.slice(0, 10);
        const group = grouped.get(day) ?? [];
        group.push(entry);
        grouped.set(day, group);
    }

    function changePeriod(period: 'today' | 'yesterday' | 'month') {
        const date = new Date();
        if (period === 'yesterday') date.setDate(date.getDate() - 1);
        const end = localDay(date);
        setFrom(period === 'month' ? end.slice(0, 8) + '01' : end);
        setTo(end);
    }

    async function downloadPDF() {
        setExportError(false);
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text(StorageService.getCompanyProfile().name || 'BillBook', 14, 18);
        doc.setFontSize(11);
        doc.text(`Daybook | ${formatDate(from)} to ${formatDate(to)}`, 14, 26);
        autoTable(doc, {
            startY: 34, head: [['Date', 'Entry', 'Party / details', 'Reference', 'Amount (INR)']],
            body: visible.map(entry => [formatDate(entry.date), entry.label, entry.name, entry.reference, entry.amount.toFixed(2)]),
        });
        const path = `daybook-${from}-to-${to}.pdf`;
        if (!Capacitor.isNativePlatform()) {
            doc.save(path);
            return;
        }
        try {
            const { uri } = await Filesystem.writeFile({ path, data: doc.output('datauristring').split(',')[1], directory: Directory.Cache });
            await Share.share({ title: 'Daybook PDF', url: uri });
        } catch {
            setExportError(true);
        }
    }

    return <div className={workspace.page}>
        <WorkspaceHeading title="Daybook" actions={<button type="button" disabled={!visible.length} onClick={downloadPDF} className={workspace.secondary}><Download size={16} /> PDF</button>}>
            Sales, purchases, payments and expenses for the selected period.
        </WorkspaceHeading>
        {exportError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">Could not export the Daybook PDF.</p>}
        <div className={`${workspace.panel} space-y-3 p-3 sm:p-4`}>
            <div className="flex flex-wrap gap-2">
                {(['today', 'yesterday', 'month'] as const).map(period => <button type="button" key={period} onClick={() => changePeriod(period)} className={`${workspace.secondary} min-h-9 text-xs`}>
                    {period === 'today' ? 'Today' : period === 'yesterday' ? 'Yesterday' : 'This month'}
                </button>)}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_2fr]">
                <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">From<input aria-label="From" className={workspace.input} type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
                <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">To<input aria-label="To" className={workspace.input} type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
                <label className="col-span-2 min-w-0 space-y-1 text-xs font-medium text-muted-foreground sm:col-span-1">Search<input className={workspace.input} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Party, voucher or reference" /></label>
            </div>
        </div>
        {valid && <WorkspaceMetrics values={[
            { label: 'Net sales', value: workspaceMoney(sum('sale')) },
            { label: 'Net purchases', value: workspaceMoney(sum('purchase')) },
            { label: 'Receipts recorded', value: workspaceMoney(sum('received')), tone: 'positive' },
            { label: 'Payments & expenses', value: workspaceMoney(sum('paid') + sum('expense')), tone: 'attention' },
        ]} />}
        <WorkspaceFilters value={type} onChange={setType} options={filters} label="Daybook entry type" />
        <section className={`${workspace.panel} divide-y divide-border overflow-hidden`} aria-label="Transaction register">
            <h2 className="flex items-center justify-between gap-2 px-4 py-3 text-sm font-semibold">Transaction register <span className="text-xs font-medium text-muted-foreground">{visible.length} entries</span></h2>
            {!visible.length && <div role="status" className="grid justify-items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground"><BookOpen size={23} />{valid ? 'No entries match these filters.' : 'Choose a valid date range.'}</div>}
            {[...grouped].map(([date, entries]) => <div key={date}>
                <h3 className="bg-surface-container-low px-4 py-2 text-xs font-semibold text-muted-foreground">{formatDate(date)}</h3>
                <ul className="divide-y divide-border">
                    {entries.map(entry => {
                        const Icon = entry.type === 'received' ? ArrowDownLeft : entry.type === 'paid' ? ArrowUpRight : entry.type === 'expense' ? Receipt : FileText;
                        const open = entry.invoice && onViewInvoice ? () => onViewInvoice(entry.invoice!)
                            : entry.partyId && onViewCustomerLedger ? () => onViewCustomerLedger(entry.partyId!) : undefined;
                        const row = <>
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon size={16} /></span>
                            <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-foreground">{entry.name}</span><span className="block break-words text-xs text-muted-foreground">{entry.label}{entry.reference ? ` · ${entry.reference}` : ''}</span></span>
                            <span className="whitespace-nowrap font-semibold tabular-nums">{workspaceMoney(entry.amount)}</span>
                            {open && <ChevronRight size={15} className="shrink-0 text-muted-foreground" />}
                        </>;
                        return <li key={entry.id}>{open ? <button type="button" onClick={open} className="flex min-h-14 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-container-low sm:gap-3 sm:px-4">{row}</button>
                            : <div className="flex min-h-14 items-center gap-2 px-3 py-2 text-sm sm:gap-3 sm:px-4">{row}</div>}</li>;
                    })}
                </ul>
            </div>)}
        </section>
    </div>;
}
