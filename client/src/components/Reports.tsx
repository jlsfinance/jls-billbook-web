import { useState } from 'react';
import { ArrowLeft, ArrowRight, BarChart3, BookOpen, Download, FileSpreadsheet, FileText, Package, ShieldCheck, Users } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { StorageService } from '../services/storageService';
import { addBrandedFooter } from '../services/pdfFooterUtils';
import { buildBusinessReport, localDay, reportCreator, UNRECORDED } from '../services/businessReports';
import type { ReportFilters, ReportSource } from '../services/businessReports';
import { formatDate } from '../utils/dateUtils';
import ProfitLossDashboard from './ProfitLossDashboard';
import CustomerAnalytics from './CustomerAnalytics';

type Filter = 'party' | 'item' | 'godown' | 'staff' | 'expiry' | 'status';
type ReportLink = { id: string; name: string; filters?: Filter[]; snapshot?: boolean; json?: boolean; requiredFilter?: 'party' | 'item' };

const groups: { label: string; icon: typeof Users; links: ReportLink[] }[] = [
  { label: 'Transaction Reports', icon: BookOpen, links: [
    { id: 'sales_summary', name: 'Sales Summary', filters: ['party', 'godown', 'status'] },
    { id: 'daily_sales', name: 'Daily Sales Summary', filters: ['party', 'godown'] },
    { id: 'purchase_report', name: 'Purchase Report', filters: ['party', 'status'] },
    { id: 'daybook', name: 'Daybook', filters: ['party'] },
    { id: 'expenses', name: 'Expense Category Report' },
    { id: 'expense_transactions', name: 'Expense Transactions' },
    { id: 'payment_register', name: 'Receipts & Payments', filters: ['party'] },
  ] },
  { label: 'Party Reports', icon: Users, links: [
    { id: 'party_ledger', name: 'Party Statement (Ledger)', filters: ['party'], requiredFilter: 'party' },
    { id: 'party_outstanding', name: 'Party-wise Outstanding', filters: ['party'], snapshot: true },
    { id: 'party_aging', name: 'Receivable Aging', filters: ['party'], snapshot: true },
    { id: 'inactive_parties', name: 'Inactive Parties', filters: ['party'] },
    { id: 'party_item_sales', name: 'Party Report by Item', filters: ['item', 'party'], requiredFilter: 'item' },
    { id: 'customer_analytics', name: 'Customer Analytics' },
  ] },
  { label: 'Item Reports', icon: Package, links: [
    { id: 'item_sales', name: 'Items Sale Summary', filters: ['item', 'godown'] },
    { id: 'hsn_sales', name: 'HSN-wise Sales Summary', filters: ['item'] },
    { id: 'item_party_sales', name: 'Item Report by Party', filters: ['party', 'item'], requiredFilter: 'party' },
    { id: 'stock_summary', name: 'Stock Summary', filters: ['item', 'godown'], snapshot: true },
    { id: 'stock_detail', name: 'Stock Detail by Godown', filters: ['item', 'godown'], snapshot: true },
    { id: 'stock_movement', name: 'Stock Movement', filters: ['item'] },
    { id: 'low_stock', name: 'Low Stock Report', filters: ['item', 'godown'], snapshot: true },
    { id: 'batch_expiry', name: 'Batch & Expiry Report', filters: ['item', 'expiry'], snapshot: true },
    { id: 'rate_list', name: 'Rate List', filters: ['item'], snapshot: true },
  ] },
  { label: 'GST Reports', icon: ShieldCheck, links: [
    { id: 'gstr1', name: 'GSTR-1 (Sales)', json: true },
    { id: 'gstr2', name: 'GSTR-2 (Purchase / ITC)' },
    { id: 'gstr3b', name: 'GSTR-3B Summary' },
    { id: 'hsn_gst_sales', name: 'GST HSN-wise Sales Summary', filters: ['item'] },
    { id: 'hsn_purchase', name: 'HSN-wise Purchase Summary', filters: ['item'] },
  ] },
  { label: 'TDS & TCS Reports', icon: FileSpreadsheet, links: [
    { id: 'tds_payable', name: 'TDS Payable', filters: ['party'] },
    { id: 'tds_receivable', name: 'TDS Receivable', filters: ['party'] },
    { id: 'tcs_payable', name: 'TCS Payable', filters: ['party'] },
    { id: 'tcs_receivable', name: 'TCS Receivable', filters: ['party'] },
  ] },
  { label: 'Staff Reports', icon: Users, links: [
    { id: 'staff_sales', name: 'Sales Summary – Staff Wise', filters: ['staff'] },
    { id: 'staff_daybook', name: 'Daybook – Staff Wise', filters: ['staff'] },
  ] },
  { label: 'Business Overview', icon: BarChart3, links: [
    { id: 'profit_loss', name: 'Profit & Loss' },
    { id: 'bill_profit', name: 'Bill-wise Profit', filters: ['party', 'godown'] },
    { id: 'balance_sheet', name: 'Balance Sheet – Operating Balances', snapshot: true },
  ] },
];

function startRange() {
  const to = localDay();
  return { from: to.slice(0, 8) + '01', to };
}

function readReports(): ReportSource {
  return {
    sales: StorageService.getInvoices(), purchases: StorageService.getPurchases(),
    debitNotes: StorageService.getVouchersByType('DEBIT_NOTE'), customers: StorageService.getCustomers(),
    products: StorageService.getProducts(), payments: StorageService.getPayments(),
    expenses: StorageService.getExpenses(), accounts: StorageService.getBankAccounts(),
    godowns: StorageService.getGodowns(), stockMovements: StorageService.getStockMovements(),
    staff: StorageService.getStaffMembers(), currentUserId: StorageService.getUserId(),
  };
}

const fields: Record<Filter, string> = { party: 'Party', item: 'Item', godown: 'Godown', staff: 'Staff', expiry: 'Expiry', status: 'Invoice status' };
const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
const panel = 'rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
const input = 'min-w-0 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800';
const presets = ['Today', 'Yesterday', 'Last 7 days', 'This month', 'Last month'] as const;

function choosePeriod(preset: typeof presets[number]) {
  const now = new Date();
  const today = localDay(now);
  const ago = (days: number) => localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
  if (preset === 'Today') return { from: today, to: today };
  if (preset === 'Yesterday') return { from: ago(1), to: ago(1) };
  if (preset === 'Last 7 days') return { from: ago(6), to: today };
  if (preset === 'Last month') return { from: localDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: localDay(new Date(now.getFullYear(), now.getMonth(), 0)) };
  return startRange();
}

function filterOptions(source: ReportSource, filter: Filter): [string, string][] {
  if (filter === 'party') return source.customers.map(p => [p.id, p.company || p.name]);
  if (filter === 'item') {
    const items = new Map(source.products.map(p => [p.id, p.name]));
    for (const voucher of [...source.sales, ...source.purchases, ...source.debitNotes]) {
      for (const item of voucher.items) {
        const key = item.productId || item.description;
        if (key && !items.has(key)) items.set(key, item.description || key);
      }
    }
    return [...items];
  }
  if (filter === 'godown') return source.godowns.map(g => [g.id, g.name]);
  if (filter === 'status') return [['PAID', 'Paid'], ['PENDING', 'Pending'], ['PARTIAL', 'Partial'], ['OVERDUE', 'Overdue']];
  if (filter === 'expiry') return ['Expired', 'Next 30 Days', 'Active', 'No Expiry'].map(value => [value, value]);
  const staff = new Map(source.staff.map(member => [member.id, member.name]));
  const recorded = new Set([...source.sales, ...source.purchases, ...source.debitNotes, ...source.payments, ...source.expenses].map(reportCreator));
  return [...recorded].map(id => [id, id === UNRECORDED ? 'Unassigned' : staff.get(id) || (id === source.currentUserId ? 'Signed-in user' : 'Other recorded user')]);
}

function ReportHeader({ title, onBack, children }: { title: string; onBack: () => void; children?: React.ReactNode }) {
  return <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
    <div className="flex min-w-0 items-center gap-2">
      <button type="button" aria-label="Back" onClick={onBack} className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowLeft size={19} /></button>
      <h1 className="text-lg font-bold leading-tight">{title}</h1>
    </div>
    {children}
  </header>;
}

function ReportPreview({ link, filters, setFilters, onBack }: {
  link: ReportLink; filters: ReportFilters; setFilters: (filters: ReportFilters) => void; onBack: () => void;
}) {
  const source = readReports();
  const today = localDay();
  const invalidDate = !link.snapshot && (!filters.from || !filters.to || filters.from > filters.to);
  const needsFilter = link.requiredFilter && !filters[link.requiredFilter];
  const data = invalidDate || needsFilter ? null : buildBusinessReport(link.id, source, filters, today);
  const period = link.snapshot ? `Current balances as of ${formatDate(today)}` : `${formatDate(filters.from)} to ${formatDate(filters.to)}`;
  const selection = link.filters?.flatMap(field => {
    if (!filters[field]) return [];
    const label = filterOptions(source, field).find(([id]) => id === filters[field])?.[1];
    return label ? [`${fields[field]}: ${label}`] : [];
  }) ?? [];

  function exportReport(kind: 'PDF' | 'Excel' | 'JSON') {
    if (!data) return;
    const company = StorageService.getCompanyProfile();
    const name = `${link.id}_${link.snapshot ? today : filters.from + '_' + filters.to}`;
    const context = [period, ...selection].join(' | ');
    if (kind === 'JSON') {
      const payload = {
        report: link.id, purpose: 'bookkeeping', company: company.name, gstin: company.gstin || company.gst || '',
        from: filters.from, to: filters.to, columns: data.headers, rows: data.rows, summary: data.summary,
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${name}_bookkeeping.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    if (kind === 'Excel') {
      const workbook = XLSX.utils.book_new();
      const intro = [[company.name], [link.name], [context], ...(data.note ? [[data.note]] : []), [], data.headers];
      const worksheet = XLSX.utils.aoa_to_sheet([...intro, ...data.rows, [], ...(data.summary || []).map(item => [item.currency ? `${item.label} (INR)` : item.label, item.value])]);
      worksheet['!cols'] = data.headers.map(header => ({ wch: Math.max(18, header.length + 4) }));
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
      XLSX.writeFile(workbook, `${name}.xlsx`);
      return;
    }
    const doc = new jsPDF({ orientation: data.headers.length > 6 ? 'landscape' : 'portrait' });
    doc.setFontSize(17);
    doc.text(company.name || 'JLS BillBook', 14, 18);
    doc.setFontSize(13);
    doc.text(link.name, 14, 27);
    doc.setFontSize(9);
    const contextLines = doc.splitTextToSize([context, data.note].filter(Boolean).join('\n'), doc.internal.pageSize.getWidth() - 28);
    doc.text(contextLines, 14, 34);
    const summary = (data.summary || []).map(item => [item.currency ? `${item.label} (INR)` : item.label, item.value]);
    autoTable(doc, { startY: 39 + contextLines.length * 4, head: [data.headers], body: data.rows, theme: 'grid', styles: { fontSize: 8, overflow: 'linebreak' }, margin: { bottom: 24 } });
    if (summary.length) {
      autoTable(doc, { body: summary, theme: 'plain', styles: { fontStyle: 'bold' }, margin: { bottom: 24 }, pageBreak: 'avoid' });
    }
    addBrandedFooter(doc, { showDisclaimer: true });
    doc.save(`${name}.pdf`);
  }

  return <div className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <ReportHeader title={link.name} onBack={onBack}>
      <div className="flex gap-2">
        {link.json && <button type="button" disabled={!data?.rows.length} onClick={() => exportReport('JSON')} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-40 dark:border-slate-700">JSON data</button>}
        <button type="button" disabled={!data?.rows.length} onClick={() => exportReport('Excel')} className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-40 dark:border-slate-700"><FileSpreadsheet size={15} /> Excel</button>
        <button type="button" disabled={!data?.rows.length} onClick={() => exportReport('PDF')} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Download size={15} /> PDF</button>
      </div>
    </ReportHeader>
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className={`${panel} flex flex-wrap gap-3 p-3`}>
          {link.snapshot ? <p className="basis-full text-xs text-slate-500 dark:text-slate-400">{period}</p> : <>
            <div role="group" aria-label="Date presets" className="flex basis-full flex-wrap gap-2">
              {presets.map(preset => <button type="button" key={preset} className="rounded-full border px-3 py-1 text-xs dark:border-slate-700" onClick={() => setFilters({ ...filters, ...choosePeriod(preset) })}>{preset}</button>)}
            </div>
            <label className="grow basis-32 text-xs font-medium">From<input type="date" className={input} value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></label>
            <label className="grow basis-32 text-xs font-medium">To<input type="date" className={input} value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></label>
          </>}
          {link.filters?.map(field => <label key={field} className="grow basis-32 text-xs font-medium">{fields[field]}
            <select className={input} value={filters[field] || ''} onChange={e => setFilters({ ...filters, [field]: e.target.value })}>
              <option value="">{link.requiredFilter === field ? (field === 'item' ? 'Select an item' : 'Select a party') : 'All'}</option>
              {filterOptions(source, field).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>)}
        </div>
        {data?.note && <p className="text-sm text-slate-600 dark:text-slate-300">{data.note}</p>}
        {!!data?.summary?.length && <dl className="grid grid-cols-[repeat(auto-fit,minmax(145px,1fr))] gap-2">
          {data.summary.map(item => <div key={item.label} className={`${panel} p-3`}><dt className="text-xs text-slate-500 dark:text-slate-400">{item.label}</dt><dd className="font-semibold tabular-nums">{item.currency ? '₹' : ''}{typeof item.value === 'number' ? number.format(item.value) : item.value}</dd></div>)}
        </dl>}
        {data?.rows.length ? <div className={`${panel} overflow-x-auto`}>
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800"><tr>{data.headers.map(header => <th key={header} scope="col" className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold">{header}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index} className="whitespace-nowrap px-3 py-2 tabular-nums">{typeof cell === 'number' ? number.format(cell) : cell}</td>)}</tr>)}
            </tbody>
          </table>
        </div> : <div role="status" className={`${panel} grid justify-items-center gap-2 px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400`}>
          <FileText size={24} />
          {invalidDate ? 'Choose a valid date range.' : needsFilter ? `Select ${link.requiredFilter === 'item' ? 'an item' : 'a party'} to view the report.` : 'No records match these filters.'}
        </div>}
      </div>
    </div>
  </div>;
}

export default function Reports({ onBack }: { onBack: () => void }) {
  const [selected, setSelected] = useState<ReportLink | null>(null);
  const [filters, setFilters] = useState<ReportFilters>(startRange);
  const [search, setSearch] = useState('');
  const closeReport = () => setSelected(null);
  if (selected?.id === 'profit_loss') return <ProfitLossDashboard onBack={closeReport} />;
  if (selected?.id === 'customer_analytics') return <CustomerAnalytics onBack={closeReport} />;
  if (selected) return <ReportPreview link={selected} filters={filters} setFilters={setFilters} onBack={closeReport} />;

  const query = search.trim().toLowerCase();
  const matching = groups.map(group => ({
    ...group, links: group.links.filter(link => !query || `${group.label} ${link.name}`.toLowerCase().includes(query)),
  })).filter(group => group.links.length);
  return <div className="min-h-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <ReportHeader title="Reports" onBack={onBack} />
    <div className="mx-auto max-w-6xl space-y-4 p-4 pb-24">
      <input aria-label="Search reports" placeholder="Search reports" type="search" className={`${input} max-w-md`} value={search} onChange={e => setSearch(e.target.value)} />
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {matching.map(group => <section key={group.label} className={panel}>
          <h2 className="flex items-center gap-2 border-b border-slate-200 px-4 py-3.5 text-sm font-bold dark:border-slate-800"><group.icon size={18} className="text-blue-600 dark:text-blue-400" />{group.label}</h2>
          {group.links.map(link => <button key={link.id} type="button" onClick={() => {
            setFilters(({ from, to }) => ({ from, to }));
            setSelected(link);
          }} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"><span>{link.name}</span><ArrowRight size={14} className="shrink-0 text-slate-400" /></button>)}
        </section>)}
      </div>
      {!matching.length && <p role="status" className="text-sm text-slate-500">No reports match your search.</p>}
    </div>
  </div>;
}
