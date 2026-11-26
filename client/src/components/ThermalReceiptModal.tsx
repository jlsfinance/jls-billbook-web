import React, { useEffect, useState } from 'react';
import { X, Printer, Bluetooth, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import QRCode from 'qrcode';
import { CompanyProfile, Invoice } from '../types';
import {
  ThermalSize,
  buildEscPosReceipt,
  printEscPosViaBluetooth,
  printThermalViaBrowser,
} from '../services/thermalPrinterService';

interface ThermalReceiptModalProps {
  invoice: Invoice;
  company: CompanyProfile;
  previousBalance?: number;
  onClose: () => void;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({
  invoice,
  company,
  previousBalance = 0,
  onClose,
}) => {
  const [size, setSize] = useState<ThermalSize>(company.thermalSize || company.invoiceSettings?.thermalSize || '80mm');
  const [showPreviousBalance, setShowPreviousBalance] = useState<boolean>(previousBalance > 0);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [btStatus, setBtStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'err'; text?: string }>({ kind: 'idle' });

  const payableAmount = showPreviousBalance
    ? Math.max(0, invoice.total + previousBalance - Number(invoice.paidAmount || invoice.amountReceived || 0))
    : Math.max(0, invoice.balanceDue ?? invoice.total);

  useEffect(() => {
    let active = true;
    const upiId = company.upiId;
    if (!upiId || payableAmount <= 0) {
      setQrDataUrl('');
      return;
    }
    const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(company.name)}&am=${payableAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Bill ${invoice.invoiceNumber}`)}`;
    QRCode.toDataURL(upiUri, { width: 140, margin: 1 })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [company.upiId, company.name, invoice.invoiceNumber, payableAmount]);

  const handleBluetoothPrint = async () => {
    setBtStatus({ kind: 'busy', text: 'Connecting to Bluetooth printer...' });
    try {
      const bytes = buildEscPosReceipt(invoice, company, size, showPreviousBalance, previousBalance);
      await printEscPosViaBluetooth(bytes);
      setBtStatus({ kind: 'ok', text: 'Sent receipt to thermal printer.' });
    } catch (err: any) {
      setBtStatus({ kind: 'err', text: err?.message || 'Bluetooth printing is unavailable on this browser/device.' });
    }
  };

  const handleDownloadEscPos = () => {
    const bytes = buildEscPosReceipt(invoice, company, size, showPreviousBalance, previousBalance);
    const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
      type: 'application/octet-stream',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoice.invoiceNumber || 'receipt'}_${size}.bin`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const docTitleMap: Record<string, string> = {
    QUOTATION: 'QUOTATION / ESTIMATE',
    PROFORMA: 'PROFORMA INVOICE',
    DELIVERY_CHALLAN: 'DELIVERY CHALLAN',
    CREDIT_NOTE: 'CREDIT NOTE',
    DEBIT_NOTE: 'DEBIT NOTE',
    PURCHASE_ORDER: 'PURCHASE ORDER',
    PURCHASE: 'PURCHASE BILL',
    SALE: company.gst_enabled ? 'TAX INVOICE' : 'BILL OF SUPPLY',
  };
  const docTitle = docTitleMap[invoice.type || 'SALE'] || 'TAX INVOICE';
  const totalTax = Number(invoice.totalCgst || 0) + Number(invoice.totalSgst || 0) + Number(invoice.totalIgst || 0);

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Printer className="w-5 h-5 text-blue-600" />
              Thermal Receipt Print (ESC/POS)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Preview 2-inch (58mm) or 3-inch (80mm) thermal slip</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {(['58mm', '80mm'] as ThermalSize[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                  size === s
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {s === '58mm' ? '58mm (2 inch)' : '80mm (3 inch)'}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={showPreviousBalance}
              onChange={(e) => setShowPreviousBalance(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Include Prev. Balance (₹{previousBalance.toLocaleString('en-IN')})
          </label>
        </div>

        {/* Receipt Paper Preview */}
        <div className="flex-1 overflow-y-auto p-5 bg-slate-100 dark:bg-slate-950 flex justify-center">
          <div
            className={`bg-white text-slate-900 font-mono text-[11px] leading-snug p-4 shadow-lg border border-slate-200 rounded-sm ${
              size === '58mm' ? 'w-[240px]' : 'w-[320px]'
            }`}
          >
            <div className="text-center border-b border-dashed border-slate-400 pb-2 mb-2">
              <div className="font-bold text-sm uppercase">{company.name}</div>
              {company.address && <div className="text-[10px]">{company.address}</div>}
              {company.phone && <div className="text-[10px]">Ph: {company.phone}</div>}
              {(company.gstin || company.gst) && (
                <div className="text-[10px] font-bold">GSTIN: {company.gstin || company.gst}</div>
              )}
            </div>

            <div className="text-center font-bold text-xs tracking-wider mb-2">{docTitle}</div>

            <div className="text-[10px] space-y-0.5 border-b border-dashed border-slate-400 pb-2 mb-2">
              <div className="flex justify-between">
                <span>No: {invoice.invoiceNumber}</span>
                <span>{invoice.date}</span>
              </div>
              <div className="truncate">Party: {invoice.customerName}</div>
              {invoice.customerGstin && <div>GSTIN: {invoice.customerGstin}</div>}
              {invoice.ewayBillNumber && <div>E-Way: {invoice.ewayBillNumber}</div>}
            </div>

            <div className="border-b border-dashed border-slate-400 pb-2 mb-2">
              <div className="flex justify-between font-bold border-b border-dotted border-slate-300 pb-1 mb-1">
                <span>ITEM</span>
                <span>AMT</span>
              </div>
              {invoice.items.map((item, idx) => (
                <div key={idx} className="mb-1">
                  <div className="font-semibold truncate">{item.description}</div>
                  <div className="flex justify-between text-[10px] text-slate-600">
                    <span>
                      {item.quantity} {item.unit || 'pcs'} x {Number(item.rate).toFixed(2)}
                    </span>
                    <span className="text-slate-900 font-semibold">
                      {Number(item.totalAmount ?? item.baseAmount ?? item.quantity * item.rate).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-0.5 text-[10px] border-b border-dashed border-slate-400 pb-2 mb-2">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{Number(invoice.subtotal || 0).toFixed(2)}</span>
              </div>
              {Number(invoice.discountAmount || 0) > 0 && (
                <div className="flex justify-between">
                  <span>Discount</span>
                  <span>-{Number(invoice.discountAmount).toFixed(2)}</span>
                </div>
              )}
              {totalTax > 0 && (
                <>
                  {Number(invoice.totalCgst || 0) > 0 && (
                    <div className="flex justify-between">
                      <span>CGST</span>
                      <span>{Number(invoice.totalCgst).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(invoice.totalSgst || 0) > 0 && (
                    <div className="flex justify-between">
                      <span>SGST</span>
                      <span>{Number(invoice.totalSgst).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(invoice.totalIgst || 0) > 0 && (
                    <div className="flex justify-between">
                      <span>IGST</span>
                      <span>{Number(invoice.totalIgst).toFixed(2)}</span>
                    </div>
                  )}
                </>
              )}
              {(invoice.additionalCharges || []).map((c) => (
                <div key={c.id} className="flex justify-between">
                  <span>{c.label}</span>
                  <span>{Number(c.amount).toFixed(2)}</span>
                </div>
              ))}
              {Number(invoice.roundUpAmount || 0) !== 0 && (
                <div className="flex justify-between">
                  <span>Round Off</span>
                  <span>{Number(invoice.roundUpAmount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-xs pt-1 border-t border-dotted border-slate-300">
                <span>NET TOTAL</span>
                <span>Rs.{Number(invoice.total || 0).toFixed(2)}</span>
              </div>
              {showPreviousBalance && previousBalance > 0 && (
                <>
                  <div className="flex justify-between">
                    <span>Prev. Balance</span>
                    <span>Rs.{previousBalance.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>TOTAL DUE</span>
                    <span>Rs.{payableAmount.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>

            {qrDataUrl && (
              <div className="flex flex-col items-center my-2">
                <img src={qrDataUrl} alt="UPI QR" className="w-24 h-24" />
                <span className="text-[9px] text-slate-600">Scan & Pay via UPI ({company.upiId})</span>
              </div>
            )}

            <div className="text-center text-[10px] pt-1 text-slate-600">
              <div>Thank you! Visit Again</div>
              <div className="text-[9px]">Powered by JLS BillBook</div>
            </div>
          </div>
        </div>

        {/* Status Message */}
        {btStatus.kind !== 'idle' && (
          <div
            className={`mx-5 mt-3 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${
              btStatus.kind === 'ok'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                : btStatus.kind === 'err'
                ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                : 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
            }`}
          >
            {btStatus.kind === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{btStatus.text}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => printThermalViaBrowser(invoice, company, size, showPreviousBalance, previousBalance)}
            className="flex-1 min-w-[150px] py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md"
          >
            <Printer className="w-4 h-4" />
            Browser Print ({size})
          </button>
          <button
            type="button"
            onClick={handleBluetoothPrint}
            className="flex-1 min-w-[150px] py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md"
          >
            <Bluetooth className="w-4 h-4" />
            Bluetooth ESC/POS
          </button>
          <button
            type="button"
            onClick={handleDownloadEscPos}
            className="py-3 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            .BIN
          </button>
        </div>
      </div>
    </div>
  );
};

export default ThermalReceiptModal;
