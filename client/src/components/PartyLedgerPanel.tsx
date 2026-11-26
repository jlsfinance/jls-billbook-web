import { Download, Eye, MessageCircle, Share2 } from 'lucide-react';
import type { Invoice } from '../types';
import type { buildPartyLedger } from '../services/businessReports';
import { formatDate } from '../utils/dateUtils';
import PartyDateRange, { type PartyRange } from './PartyDateRange';
import { workspace, workspaceMoney } from './WorkspaceUI';

type Ledger = ReturnType<typeof buildPartyLedger>;
export type PartyLedgerRow = Ledger['rows'][number];

export function isLedgerDebit(row: PartyLedgerRow) {
  return row.delta === 0 ? row.direction > 0 : row.delta > 0;
}

export default function PartyLedgerPanel({ ledger, range, onRangeChange, onDownload, onShare, onShareEntry, onView }: {
  ledger: Ledger;
  range: PartyRange;
  onRangeChange: (range: PartyRange) => void;
  onDownload: () => void;
  onShare: () => void;
  onShareEntry: (row: PartyLedgerRow) => void;
  onView: (voucher: Invoice) => void;
}) {
  const balance = (value: number) => workspaceMoney(Math.abs(value)) + (value > 0 ? ' Dr' : value < 0 ? ' Cr' : '');
  const columns = [
    { title: 'Debit', hint: 'Sales bills · Money out', rows: ledger.rows.filter(isLedgerDebit), total: ledger.debit },
    { title: 'Credit', hint: 'Money in · Purchase bills', rows: ledger.rows.filter(row => !isLedgerDebit(row)), total: ledger.credit },
  ];

  return <section aria-labelledby="party-history" className="overflow-hidden rounded-[1.6rem] border border-border bg-surface dark:bg-[#111216]">
    <div className="space-y-3 border-b border-border p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 min-[370px]:flex-nowrap">
        <h2 id="party-history" className="min-w-0 font-heading text-base font-black sm:text-lg">Transaction History</h2>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" aria-label="Share ledger PDF" onClick={onShare} className={workspace.secondary + ' !h-10 !min-h-10 w-10 !rounded-full !px-0 text-primary'}><Share2 size={17} /></button>
          <button type="button" onClick={onDownload} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700"><Download size={16} /> Export PDF</button>
        </div>
      </div>
      <PartyDateRange value={range} onChange={onRangeChange} />
    </div>
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-border px-3 py-3 text-xs sm:px-4">
      <span className="font-semibold text-muted-foreground">Opening balance</span>
      <strong className="tabular-nums">{balance(ledger.opening)}</strong>
    </div>
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] divide-x divide-border">
      {columns.map(column => <section key={column.title} aria-label={column.title + ' entries'} className="flex min-w-0 flex-col">
        <div className="border-b border-border bg-surface-container-low px-2.5 py-2.5 sm:px-4 dark:bg-[#0e0f13]">
          <h3 className="text-sm font-bold">{column.title}</h3>
          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground sm:text-xs">{column.hint}</p>
        </div>
        <ul className="flex-1 divide-y divide-border">
          {column.rows.map(row => {
            const value = row.debit || row.credit;
            const id = row.ref || row.record.data.id;
            return <li key={row.record.kind + ':' + row.record.data.id + (row.settlement ? ':settlement' : '')} className="px-2.5 py-2.5 sm:px-4">
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-muted-foreground sm:text-xs">
                <time dateTime={row.date}>{formatDate(row.date.slice(0, 10))}</time>
                {row.status && <span className="rounded-full bg-surface-container-highest px-1.5 py-0.5 font-semibold">{row.status === 'PARTIAL' ? 'Part-paid' : row.status.toLowerCase()}</span>}
              </p>
              <p className="mt-0.5 break-words text-xs font-bold sm:text-sm">{row.kind}{row.ref && ' · ' + row.ref}</p>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-0.5">
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold tabular-nums">{workspaceMoney(value)}</p>
                  {(row.record.kind === 'payment' || row.settlement) && row.mode && <p className="text-[10px] text-muted-foreground">{row.mode.replace(/_/g, ' ')}</p>}
                </div>
                {!row.settlement && <div className="flex">
                  <button type="button" aria-label={'WhatsApp ' + id} onClick={() => onShareEntry(row)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-emerald-700 hover:bg-surface-container-high dark:text-emerald-400"><MessageCircle size={15} /></button>
                  {row.record.kind === 'voucher' && <button type="button" aria-label={'View ' + id} onClick={() => {
                    if (row.record.kind === 'voucher') onView(row.record.data);
                  }} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-primary hover:bg-surface-container-high"><Eye size={15} /></button>}
                </div>}
              </div>
            </li>;
          })}
          {!column.rows.length && <li className="px-2.5 py-4 text-xs text-muted-foreground sm:px-4">No entries</li>}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-x-1 border-t border-border px-2.5 py-2.5 text-xs sm:px-4">
          <span>Total {column.title.toLowerCase()}</span><strong className="tabular-nums">{workspaceMoney(column.total)}</strong>
        </div>
      </section>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-3 sm:px-4">
      <span className="text-sm font-bold">Closing balance</span>
      <strong className="text-sm tabular-nums text-primary dark:text-blue-400">{balance(ledger.closing)}</strong>
    </div>
  </section>;
}
