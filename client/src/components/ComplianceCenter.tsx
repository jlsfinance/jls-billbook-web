import React, { useMemo, useState } from 'react';
import { ArrowLeft, ShieldCheck, Download, FileCode2, Truck } from 'lucide-react';
import { CompanyProfile, Customer, Invoice, Product } from '../types';
import { StorageService } from '../services/storageService';

const escapeXml = (s: string | number | undefined): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const buildEInvoiceIrnJson = (invoice: Invoice, company: CompanyProfile) => ({
  Version: '1.1',
  TranDtls: {
    TaxSch: 'GST',
    SupTyp: invoice.customerGstin ? 'B2B' : 'B2C',
    RegRev: 'N',
  },
  DocDtls: {
    Typ: invoice.type === 'CREDIT_NOTE' ? 'CRN' : invoice.type === 'DEBIT_NOTE' ? 'DBN' : 'INV',
    No: invoice.invoiceNumber,
    Dt: invoice.date.split('-').reverse().join('/'),
  },
  SellerDtls: {
    Gstin: company.gstin || company.gst || '',
    LglNm: company.name,
    Addr1: company.address || '',
    Loc: company.state || 'Delhi',
    Stcd: (company.gstin || company.gst || '07').slice(0, 2) || '07',
  },
  BuyerDtls: {
    Gstin: invoice.customerGstin || 'URP',
    LglNm: invoice.customerName,
    Pos: (invoice.customerGstin || '07').slice(0, 2) || '07',
    Addr1: invoice.customerAddress || '',
    Stcd: (invoice.customerGstin || '07').slice(0, 2) || '07',
  },
  ItemList: invoice.items.map((it, idx) => ({
    SlNo: String(idx + 1),
    PrdDesc: it.description,
    IsServc: 'N',
    HsnCd: it.hsn || '9999',
    Qty: it.quantity,
    Unit: (it.unit || 'PCS').toUpperCase(),
    UnitPrice: it.rate,
    TotAmt: it.baseAmount,
    AssAmt: it.baseAmount,
    GstRt: it.gstRate || 0,
    CgstAmt: it.cgstAmount || 0,
    SgstAmt: it.sgstAmount || 0,
    IgstAmt: it.igstAmount || 0,
    TotItemVal: it.totalAmount || it.baseAmount,
  })),
  ValDtls: {
    AssVal: invoice.subtotal,
    CgstVal: invoice.totalCgst || 0,
    SgstVal: invoice.totalSgst || 0,
    IgstVal: invoice.totalIgst || 0,
    TotInvVal: invoice.total,
  },
});

export const buildEWayBillJson = (invoice: Invoice, company: CompanyProfile) => ({
  version: '1.0.0423',
  billLists: [
    {
      supplyType: 'O',
      subSupplyType: '1',
      docType: 'INV',
      docNo: invoice.invoiceNumber,
      docDate: invoice.date.split('-').reverse().join('/'),
      fromGstin: company.gstin || company.gst || 'URP',
      fromTrdName: company.name,
      fromAddr1: company.address || '',
      fromStateCode: Number((company.gstin || '07').slice(0, 2)) || 7,
      toGstin: invoice.customerGstin || 'URP',
      toTrdName: invoice.customerName,
      toAddr1: invoice.customerAddress || '',
      toStateCode: Number((invoice.customerGstin || '07').slice(0, 2)) || 7,
      totalValue: invoice.subtotal,
      cgstValue: invoice.totalCgst || 0,
      sgstValue: invoice.totalSgst || 0,
      igstValue: invoice.totalIgst || 0,
      totInvValue: invoice.total,
      transporterId: invoice.transporterId || '',
      transporterName: invoice.transporterName || '',
      transDistance: invoice.transportDistanceKm || 10,
      vehicleNo: invoice.vehicleNumber || '',
      itemList: invoice.items.map((it) => ({
        productName: it.description,
        hsnCode: Number(it.hsn || '9999') || 9999,
        quantity: it.quantity,
        qtyUnit: (it.unit || 'PCS').toUpperCase(),
        taxableAmount: it.baseAmount,
      })),
    },
  ],
});

export const buildTallyXmlEnvelope = (
  company: CompanyProfile,
  customers: Customer[],
  products: Product[],
  invoices: Invoice[]
): string => {
  const ledgersXml = customers
    .map(
      (c) => `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <LEDGER NAME="${escapeXml(c.company || c.name)}" ACTION="Create">
        <NAME>${escapeXml(c.company || c.name)}</NAME>
        <PARENT>${c.type === 'VENDOR' ? 'Sundry Creditors' : 'Sundry Debtors'}</PARENT>
        <OPENINGBALANCE>${(-Number(c.openingBalance || 0)).toFixed(2)}</OPENINGBALANCE>
      </LEDGER>
    </TALLYMESSAGE>`
    )
    .join('');

  const itemsXml = products
    .map(
      (p) => `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <STOCKITEM NAME="${escapeXml(p.name)}" ACTION="Create">
        <NAME>${escapeXml(p.name)}</NAME>
        <BASEUNITS>${escapeXml(p.unit || 'pcs')}</BASEUNITS>
      </STOCKITEM>
    </TALLYMESSAGE>`
    )
    .join('');

  const vouchersXml = invoices
    .filter(invoice => !invoice.type || invoice.type === 'SALE')
    .map(
      (inv) => `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="Sales" ACTION="Create">
        <DATE>${escapeXml(inv.date.replace(/-/g, ''))}</DATE>
        <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
        <VOUCHERNUMBER>${escapeXml(inv.invoiceNumber)}</VOUCHERNUMBER>
        <PARTYLEDGERNAME>${escapeXml(inv.customerName)}</PARTYLEDGERNAME>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${escapeXml(inv.customerName)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>-${Number(inv.total).toFixed(2)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>Sales</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${Number(inv.total).toFixed(2)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
      </VOUCHER>
    </TALLYMESSAGE>`
    )
    .join('');

  return `<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES><SVCURRENTCOMPANY>${escapeXml(company.name)}</SVCURRENTCOMPANY></STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>${ledgersXml}${itemsXml}${vouchersXml}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
};

interface ComplianceCenterProps {
  onBack?: () => void;
}

function IssuedReferences({ invoice, onSaved }: { invoice: Invoice; onSaved: () => void }) {
  const [irn, setIrn] = useState(invoice.irn || '');
  const [ackNo, setAckNo] = useState(invoice.ackNo || '');
  const [ackDate, setAckDate] = useState(invoice.ackDate?.slice(0, 10) || '');
  const [eway, setEway] = useState(invoice.ewayBillNumber || '');
  const [ewayDate, setEwayDate] = useState(invoice.ewayBillDate?.slice(0, 10) || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const field = 'min-w-0 rounded-xl border bg-background px-3 py-2 text-sm';

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');
    setError('');
    if ((ackNo.trim() || ackDate) && !irn.trim()) { setError('Enter the issued IRN for the acknowledgement.'); return; }
    if (ewayDate && !eway.trim()) { setError('Enter the issued E-Way Bill number for this date.'); return; }
    setBusy(true);
    try {
      await StorageService.saveComplianceReferences(invoice.id, {
        irn: irn.trim(), ackNo: ackNo.trim(), ackDate, ewayBillNumber: eway.trim(), ewayBillDate: ewayDate,
      });
      onSaved();
      setMessage('Issued references saved to this invoice.');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not save the references.');
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={save} className="space-y-3 rounded-2xl border bg-card p-4">
    <div>
      <h2 className="font-semibold">Record issued references</h2>
      <p className="text-sm text-muted-foreground">Enter the references returned by your invoice or E-Way Bill provider.</p>
    </div>
    <label className="grid gap-1 text-sm">Invoice Reference Number
      <input value={irn} onChange={event => setIrn(event.target.value)} maxLength={128} className={field} />
    </label>
    <div className="grid items-end gap-3 sm:grid-cols-2">
      <label className="grid min-w-0 gap-1 text-sm">Acknowledgement number
        <input value={ackNo} onChange={event => setAckNo(event.target.value)} maxLength={40} className={field} />
      </label>
      <label className="grid min-w-0 gap-1 text-sm">Acknowledgement date
        <input value={ackDate} type="date" onChange={event => setAckDate(event.target.value)} className={field} />
      </label>
      <label className="grid min-w-0 gap-1 text-sm">E-Way Bill number
        <input value={eway} onChange={event => setEway(event.target.value)} maxLength={40} className={field} />
      </label>
      <label className="grid min-w-0 gap-1 text-sm">E-Way Bill date
        <input value={ewayDate} type="date" onChange={event => setEwayDate(event.target.value)} className={field} />
      </label>
    </div>
    <button type="submit" disabled={busy} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
      {busy ? 'Saving…' : 'Save references'}
    </button>
    {message && <p role="status" className="text-sm">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
  </form>;
}

export const ComplianceCenter: React.FC<ComplianceCenterProps> = ({ onBack }) => {
  const company = StorageService.getCompanyProfile();
  const [invoices, setInvoices] = useState(() => StorageService.getInvoices());
  const customers = useMemo(() => StorageService.getCustomers(), []);
  const products = useMemo(() => StorageService.getProducts(), []);
  const [selectedId, setSelectedId] = useState<string>(invoices[0]?.id || '');

  const selectedInvoice = invoices.find((i) => i.id === selectedId) || invoices[0];
  const sales = invoices.filter(invoice => !invoice.type || invoice.type === 'SALE');

  const downloadFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-28">
      <div className="sticky top-0 z-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button type="button" onClick={onBack} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              GST, E-Way Bill &amp; Tally Sync
            </h1>
            <p className="text-xs text-slate-500">Export NIC E-Invoice JSON, E-Way Bill JSON &amp; Tally XML</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 space-y-3">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <Truck className="w-4 h-4 text-blue-600" /> E-Invoice (NIC v1.1) &amp; E-Way Bill JSON
          </h2>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold"
          >
            {invoices.length === 0 ? (
              <option value="">No invoices available</option>
            ) : (
              invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  #{inv.invoiceNumber} — {inv.customerName} (₹{inv.total})
                </option>
              ))
            )}
          </select>

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              disabled={!selectedInvoice}
              onClick={() =>
                selectedInvoice &&
                downloadFile(
                  `einvoice_${selectedInvoice.invoiceNumber}.json`,
                  JSON.stringify(buildEInvoiceIrnJson(selectedInvoice, company), null, 2),
                  'application/json'
                )
              }
              className="px-4 py-2.5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-40"
            >
              <Download className="w-4 h-4" /> Download E-Invoice IRN JSON
            </button>

            <button
              type="button"
              disabled={!selectedInvoice}
              onClick={() =>
                selectedInvoice &&
                downloadFile(
                  `ewaybill_${selectedInvoice.invoiceNumber}.json`,
                  JSON.stringify(buildEWayBillJson(selectedInvoice, company), null, 2),
                  'application/json'
                )
              }
              className="px-4 py-2.5 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-40"
            >
              <Download className="w-4 h-4" /> Download E-Way Bill JSON
            </button>
          </div>
        </div>

        {selectedInvoice && <IssuedReferences key={selectedInvoice.id} invoice={selectedInvoice} onSaved={() => setInvoices(StorageService.getInvoices())} />}

        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 space-y-3">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-purple-600" /> Tally Prime XML Export
          </h2>
          <p className="text-xs text-slate-500">
            Exports {customers.length} party ledgers, {products.length} stock items, and {sales.length} sales vouchers in TallyPrime XML format.
          </p>
          <button
            type="button"
            onClick={() =>
              downloadFile(
                `tally_export_${new Date().toISOString().split('T')[0]}.xml`,
                buildTallyXmlEnvelope(company, customers, products, sales),
                'application/xml'
              )
            }
            className="px-5 py-3 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Export Tally Prime XML
          </button>
        </div>
      </div>
    </div>
  );
};

export default ComplianceCenter;
