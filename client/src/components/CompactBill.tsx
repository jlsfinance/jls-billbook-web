import type { CompanyProfile, Invoice } from '../types';
import { formatDate } from '../utils/dateUtils';

const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const money = (amount: number) => '₹' + number.format(amount);
const itemHeaders = ['#', 'Item description', 'Qty', 'Rate', 'Amount'];

export default function CompactBill({ invoice, company, label, qrCodeUrl, previousBalance, showDetails }: {
  invoice: Invoice;
  company: CompanyProfile;
  label: string;
  qrCodeUrl: string;
  previousBalance: number | null;
  showDetails: boolean;
}) {
  const quantity = invoice.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const rows = [
    { label: 'Subtotal', amount: invoice.subtotal },
    ...(invoice.gstEnabled ? [
      { label: 'CGST', amount: invoice.totalCgst }, { label: 'SGST', amount: invoice.totalSgst },
      { label: 'IGST', amount: invoice.totalIgst },
    ].filter(row => row.amount) : []),
    ...(invoice.additionalCharges || []).map(charge => ({ label: charge.label, amount: Number(charge.amount) })),
    ...(invoice.discountAmount ? [{ label: 'Discount', amount: -invoice.discountAmount }] : []),
    ...(invoice.tdsAmount ? [{ label: 'TDS', amount: -invoice.tdsAmount }] : []),
    ...(invoice.tcsAmount ? [{ label: 'TCS', amount: invoice.tcsAmount }] : []),
  ];

  return <div id="printable-area" className="mx-auto max-w-3xl px-2 pt-2.5 sm:px-4 sm:pt-4">
    <article className="overflow-hidden rounded-[1.6rem] border border-border bg-surface dark:bg-[#111216]">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground sm:text-xs">
          <span className="break-all">{label} #{invoice.invoiceNumber}</span>
          {invoice.date && <span>· <time dateTime={invoice.date}>{formatDate(invoice.date)}</time></span>}
        </p>
        <h2 className="mt-1 break-words font-heading text-lg font-black uppercase text-foreground sm:text-2xl">{invoice.customerName || 'Walk-in'}</h2>
      </div>

      <table className="w-full table-fixed text-sm" aria-label="Bill items">
        <colgroup>
          <col className="w-[11%]" /><col className="w-[38%]" /><col className="w-[13%]" /><col className="w-[17%]" /><col className="w-[21%]" />
        </colgroup>
        <thead className="border-b border-border bg-surface-container-low dark:bg-[#0e0f13]">
          <tr>{itemHeaders.map((title, i) => <th key={title} scope="col" className={`px-1.5 py-2.5 text-[9px] font-extrabold uppercase tracking-wide text-muted-foreground sm:py-3 sm:text-[11px] ${i === 0 ? 'pl-3 text-left sm:pl-5' : i === 1 ? 'text-left' : i === 2 ? 'text-center' : i === 3 ? 'text-right' : 'pr-3 text-right sm:pr-5'}`}>
            {title}
          </th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {invoice.items.map((item, i) => <tr key={i} className="align-top tabular-nums">
            <td className="py-3 pl-3 font-semibold text-muted-foreground sm:pl-5">{i + 1}</td>
            <td className="break-words px-1.5 py-3 font-bold">{item.description}</td>
            <td className="break-words px-0.5 py-3 text-center font-bold">{number.format(item.quantity)}</td>
            <td className="break-words px-1.5 py-3 text-right text-muted-foreground">{money(item.rate)}</td>
            <td className="break-words py-3 pl-1 pr-3 text-right font-extrabold sm:pr-5">{money(item.totalAmount ?? item.baseAmount ?? item.quantity * item.rate)}</td>
          </tr>)}
        </tbody>
      </table>

      <div className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)] items-center gap-2 border-t border-border px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground sm:text-xs">Total qty</span>
          <strong className="text-base tabular-nums sm:text-lg">{number.format(quantity)}</strong>
        </div>
        <dl className="min-w-0 space-y-1.5 tabular-nums" aria-label="Bill totals">
          {rows.map((row, i) => <div key={i} className="flex min-w-0 justify-between gap-2 text-xs font-semibold text-muted-foreground">
            <dt className="min-w-0 break-words">{row.label}</dt><dd className="shrink-0">{money(row.amount ?? 0)}</dd>
          </div>)}
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 border-t border-border pt-2 text-base font-black uppercase sm:text-xl">
            <dt>Total</dt><dd className={invoice.type === 'CREDIT_NOTE' ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-700 dark:text-emerald-400'}>{money(invoice.total)}</dd>
          </div>
          {previousBalance !== null && <>
            <div className="flex justify-between gap-2 text-xs text-muted-foreground"><dt>Previous balance</dt><dd>{money(previousBalance)}</dd></div>
            <div className="flex justify-between gap-2 text-sm font-bold"><dt>Net payable</dt><dd>{money(invoice.total + previousBalance)}</dd></div>
          </>}
        </dl>
      </div>

      {company.upiId && qrCodeUrl && <section aria-label="Payment QR" className="flex justify-center border-t border-border px-3 py-4 sm:py-5">
        <div className="flex min-w-0 max-w-full items-center gap-3 rounded-2xl border border-border p-2.5">
          <img src={qrCodeUrl} alt="UPI payment QR code" className="h-[3.75rem] w-[3.75rem] shrink-0 bg-white sm:h-16 sm:w-16" />
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-primary dark:text-blue-400">Payment QR</p>
            <p className="break-all text-xs font-bold">{company.upiId}</p>
          </div>
        </div>
      </section>}

      {showDetails && <section aria-label="Bill details" className="space-y-2 border-t border-border px-4 py-4 text-xs sm:px-5">
        <h3 className="text-sm font-bold">Bill details</h3>
        {company.name && <p><strong>Issued by</strong> {company.name}</p>}
        {company.address && <p className="whitespace-pre-line">{company.address}</p>}
        {(invoice.supplierGstin || company.gstin) && <p><strong>Supplier GSTIN</strong> {invoice.supplierGstin || company.gstin}</p>}
        {invoice.customerAddress && <p className="whitespace-pre-line"><strong>Billing address</strong> {invoice.customerAddress}</p>}
        {invoice.customerGstin && <p><strong>Customer GSTIN</strong> {invoice.customerGstin}</p>}
        {invoice.dueDate && <p><strong>Due date</strong> {formatDate(invoice.dueDate)}</p>}
        {!!invoice.roundUpAmount && <p><strong>Round-off</strong> {money(invoice.roundUpAmount)}</p>}
        {invoice.irn && <p className="break-all"><strong>IRN</strong> {invoice.irn}</p>}
        {invoice.ackNo && <p><strong>Acknowledgement</strong> {invoice.ackNo} {formatDate(invoice.ackDate)}</p>}
        {invoice.ewayBillNumber && <p><strong>E-Way Bill</strong> {invoice.ewayBillNumber} {formatDate(invoice.ewayBillDate)}</p>}
        {invoice.items.some(item => item.hsn) && <ul aria-label="Item HSN codes">
          {invoice.items.map((item, i) => item.hsn && <li key={i}><strong>{item.description}</strong> · HSN {item.hsn}</li>)}
        </ul>}
        {invoice.notes && <p className="whitespace-pre-line"><strong>Notes</strong> {invoice.notes}</p>}
        {invoice.terms && <p className="whitespace-pre-line"><strong>Terms</strong> {invoice.terms}</p>}
      </section>}
    </article>
  </div>;
}
