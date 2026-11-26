import { CompanyProfile, Invoice } from '../types';
import { formatDate } from '../utils/dateUtils';

export type ThermalSize = '58mm' | '80mm';

const ESC = 0x1b;
const GS = 0x1d;

function padRight(str: string, width: number): string {
  const s = str.slice(0, width);
  return s + ' '.repeat(Math.max(0, width - s.length));
}

function padLeft(str: string, width: number): string {
  const s = str.slice(0, width);
  return ' '.repeat(Math.max(0, width - s.length)) + s;
}

function twoCol(left: string, right: string, cols: number): string {
  const r = right.slice(0, Math.floor(cols / 2));
  const maxL = Math.max(1, cols - r.length - 1);
  const l = left.slice(0, maxL);
  const spaces = Math.max(1, cols - l.length - r.length);
  return l + ' '.repeat(spaces) + r;
}

function voucherTitle(type?: Invoice['type']): string {
  switch (type) {
    case 'QUOTATION':
      return 'QUOTATION / ESTIMATE';
    case 'PROFORMA':
      return 'PROFORMA INVOICE';
    case 'DELIVERY_CHALLAN':
      return 'DELIVERY CHALLAN';
    case 'CREDIT_NOTE':
      return 'CREDIT NOTE';
    case 'DEBIT_NOTE':
      return 'DEBIT NOTE';
    case 'PURCHASE':
      return 'PURCHASE BILL';
    case 'PURCHASE_ORDER':
      return 'PURCHASE ORDER';
    default:
      return 'TAX INVOICE';
  }
}

/**
 * Build deterministic ESC/POS bytes for 58mm (32 chars) or 80mm (48 chars) thermal printers.
 */
export function buildEscPosReceipt(
  invoice: Invoice,
  company: CompanyProfile,
  size: ThermalSize = '58mm',
  showPreviousBalance = false,
  previousBalance = 0
): Uint8Array {
  const cols = size === '80mm' ? 48 : 32;
  const divider = '-'.repeat(cols);
  const out: number[] = [];

  const pushBytes = (...bytes: number[]) => out.push(...bytes);
  const pushText = (text: string) => {
    const clean = text.replace(/₹/g, 'Rs.').replace(/[^\x20-\x7E\n]/g, ' ');
    for (let i = 0; i < clean.length; i++) {
      out.push(clean.charCodeAt(i));
    }
  };
  const line = (text = '') => pushText(text + '\n');

  // Initialize printer
  pushBytes(ESC, 0x40);
  // Center + Bold + Double Height for Shop Name
  pushBytes(ESC, 0x61, 0x01, ESC, 0x45, 0x01, GS, 0x21, 0x01);
  line((company.name || 'JLS BillBook').toUpperCase().slice(0, cols));
  pushBytes(GS, 0x21, 0x00, ESC, 0x45, 0x00);

  if (company.address) {
    const addr = company.address.replace(/\n+/g, ', ');
    for (let i = 0; i < addr.length; i += cols) {
      line(addr.slice(i, i + cols));
    }
  }
  if (company.phone) line(`Ph: ${company.phone}`);
  const gstin = company.gstin || company.gst;
  if (gstin) line(`GSTIN: ${gstin}`);

  line(divider);
  pushBytes(ESC, 0x45, 0x01);
  line(voucherTitle(invoice.type));
  pushBytes(ESC, 0x45, 0x00);
  line(divider);

  // Left align metadata
  pushBytes(ESC, 0x61, 0x00);
  line(twoCol(`No: ${invoice.invoiceNumber}`, formatDate(invoice.date), cols));
  line(`Party: ${(invoice.customerName || 'Cash').slice(0, cols - 7)}`);
  if (invoice.customerGstin) line(`Party GST: ${invoice.customerGstin}`);
  line(divider);

  // Item header
  if (cols >= 48) {
    line(padRight('ITEM', 22) + padLeft('QTY', 6) + padLeft('RATE', 9) + padLeft('AMT', 11));
  } else {
    line(padRight('ITEM', 14) + padLeft('QTY', 5) + padLeft('AMT', 13));
  }
  line(divider);

  for (const item of invoice.items) {
    const qtyStr = String(item.quantity);
    const amtStr = (item.totalAmount ?? item.baseAmount ?? 0).toFixed(2);
    if (cols >= 48) {
      const name = (item.description || '').slice(0, 21);
      line(
        padRight(name, 22) +
          padLeft(qtyStr, 6) +
          padLeft(item.rate.toFixed(2), 9) +
          padLeft(amtStr, 11)
      );
    } else {
      line((item.description || '').slice(0, cols));
      line(
        padRight(`  ${qtyStr} x ${item.rate.toFixed(2)}`, 19) +
          padLeft(amtStr, 13)
      );
    }
  }

  line(divider);
  line(twoCol('Subtotal', `Rs.${(invoice.subtotal || 0).toFixed(2)}`, cols));
  if (invoice.gstEnabled) {
    if ((invoice.totalCgst || 0) > 0) line(twoCol('CGST', `Rs.${invoice.totalCgst!.toFixed(2)}`, cols));
    if ((invoice.totalSgst || 0) > 0) line(twoCol('SGST', `Rs.${invoice.totalSgst!.toFixed(2)}`, cols));
    if ((invoice.totalIgst || 0) > 0) line(twoCol('IGST', `Rs.${invoice.totalIgst!.toFixed(2)}`, cols));
  }
  if ((invoice.discountAmount || 0) > 0) {
    line(twoCol('Discount', `-Rs.${invoice.discountAmount!.toFixed(2)}`, cols));
  }
  if ((invoice.roundUpAmount || 0) !== 0) {
    line(twoCol('Round Off', `Rs.${invoice.roundUpAmount!.toFixed(2)}`, cols));
  }

  line(divider);
  pushBytes(ESC, 0x45, 0x01, GS, 0x21, 0x01);
  line(twoCol('TOTAL', `Rs.${invoice.total.toFixed(2)}`, cols));
  pushBytes(GS, 0x21, 0x00, ESC, 0x45, 0x00);

  if (showPreviousBalance && previousBalance !== 0) {
    line(twoCol('Prev. Balance', `Rs.${previousBalance.toFixed(2)}`, cols));
    line(twoCol('Net Payable', `Rs.${(invoice.total + previousBalance).toFixed(2)}`, cols));
  }

  if ((invoice.amountReceived ?? 0) > 0) {
    line(twoCol('Received', `Rs.${(invoice.amountReceived || 0).toFixed(2)}`, cols));
  }
  if ((invoice.balanceDue ?? 0) > 0) {
    line(twoCol('Balance Due', `Rs.${(invoice.balanceDue || 0).toFixed(2)}`, cols));
  }

  line(divider);
  pushBytes(ESC, 0x61, 0x01);
  if (company.upiId) line(`UPI: ${company.upiId}`);
  line('Thank you! Visit Again');
  line('');
  line('');
  line('');

  // Feed and partial cut
  pushBytes(GS, 0x56, 0x42, 0x00);
  return new Uint8Array(out);
}

/**
 * Send ESC/POS payload over Web Bluetooth GATT characteristic.
 */
export async function printEscPosViaBluetooth(bytes: Uint8Array): Promise<void> {
  const nav = navigator as Navigator & {
    bluetooth?: {
      requestDevice: (opts: any) => Promise<any>;
    };
  };
  if (!nav.bluetooth) {
    throw new Error('Web Bluetooth is not supported on this browser/device. Use System Thermal Print instead.');
  }

  const serviceUUIDs = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  ];

  const device = await nav.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: serviceUUIDs,
  });

  const server = await device.gatt?.connect();
  if (!server) throw new Error('Could not connect to printer GATT server.');

  const services = await server.getPrimaryServices();
  let writableChar: any = null;
  for (const svc of services) {
    const chars = await svc.getCharacteristics();
    for (const ch of chars) {
      if (ch.properties?.write || ch.properties?.writeWithoutResponse) {
        writableChar = ch;
        break;
      }
    }
    if (writableChar) break;
  }

  if (!writableChar) {
    throw new Error('No writable Bluetooth print characteristic found.');
  }

  const chunkSize = 100;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    if (writableChar.properties?.writeWithoutResponse && writableChar.writeValueWithoutResponse) {
      await writableChar.writeValueWithoutResponse(chunk);
    } else {
      await writableChar.writeValue(chunk);
    }
  }
}

/**
 * Open a clean 58mm / 80mm thermal slip print dialog (works on USB / Wi-Fi / Android Print Service).
 */
export function printThermalViaBrowser(
  invoice: Invoice,
  company: CompanyProfile,
  size: ThermalSize = '58mm',
  showPreviousBalance = false,
  previousBalance = 0
): void {
  const widthMm = size === '80mm' ? 76 : 54;
  const gstin = company.gstin || company.gst || '';
  const itemsHtml = invoice.items
    .map(
      (item) => `
      <tr>
        <td style="padding:2px 0;font-weight:600;">${escapeHtml(item.description)}</td>
        <td style="text-align:center;padding:2px 2px;">${item.quantity}</td>
        <td style="text-align:right;padding:2px 2px;">${item.rate.toFixed(0)}</td>
        <td style="text-align:right;padding:2px 0;font-weight:700;">${(item.totalAmount ?? item.baseAmount ?? 0).toFixed(2)}</td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html>
  <html><head><meta charset="utf-8" /><title>${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    @page { size: ${size === '80mm' ? '80mm' : '58mm'} auto; margin: 2mm; }
    body { width: ${widthMm}mm; margin: 0 auto; font-family: 'Courier New', monospace; font-size: ${size === '80mm' ? '12px' : '10px'}; color: #000; }
    .c { text-align: center; } .b { font-weight: 700; } .hr { border-top: 1px dashed #000; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; font-size: inherit; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; }
  </style></head>
  <body>
    <div class="c b" style="font-size:1.25em;">${escapeHtml(company.name || 'JLS BillBook')}</div>
    <div class="c">${escapeHtml(company.address || '')}</div>
    ${company.phone ? `<div class="c">Ph: ${escapeHtml(company.phone)}</div>` : ''}
    ${gstin ? `<div class="c b">GSTIN: ${escapeHtml(gstin)}</div>` : ''}
    <div class="hr"></div>
    <div class="c b">${voucherTitle(invoice.type)}</div>
    <div class="hr"></div>
    <div class="row"><span>No: ${escapeHtml(invoice.invoiceNumber)}</span><span>${formatDate(invoice.date)}</span></div>
    <div>Party: <b>${escapeHtml(invoice.customerName || 'Cash')}</b></div>
    ${invoice.customerGstin ? `<div>GSTIN: ${escapeHtml(invoice.customerGstin)}</div>` : ''}
    <div class="hr"></div>
    <table>
      <thead><tr><th align="left">Item</th><th align="center">Qty</th><th align="right">Rate</th><th align="right">Amt</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div class="hr"></div>
    <div class="row"><span>Subtotal</span><span>Rs.${(invoice.subtotal || 0).toFixed(2)}</span></div>
    ${invoice.gstEnabled && (invoice.totalCgst || 0) > 0 ? `<div class="row"><span>CGST</span><span>Rs.${invoice.totalCgst!.toFixed(2)}</span></div>` : ''}
    ${invoice.gstEnabled && (invoice.totalSgst || 0) > 0 ? `<div class="row"><span>SGST</span><span>Rs.${invoice.totalSgst!.toFixed(2)}</span></div>` : ''}
    ${invoice.gstEnabled && (invoice.totalIgst || 0) > 0 ? `<div class="row"><span>IGST</span><span>Rs.${invoice.totalIgst!.toFixed(2)}</span></div>` : ''}
    ${(invoice.discountAmount || 0) > 0 ? `<div class="row"><span>Discount</span><span>-Rs.${invoice.discountAmount!.toFixed(2)}</span></div>` : ''}
    <div class="hr"></div>
    <div class="row b" style="font-size:1.2em;"><span>NET TOTAL</span><span>Rs.${invoice.total.toFixed(2)}</span></div>
    ${showPreviousBalance && previousBalance !== 0 ? `<div class="row"><span>Prev. Bal</span><span>Rs.${previousBalance.toFixed(2)}</span></div><div class="row b"><span>Grand Total</span><span>Rs.${(invoice.total + previousBalance).toFixed(2)}</span></div>` : ''}
    <div class="hr"></div>
    ${company.upiId ? `<div class="c">UPI ID: ${escapeHtml(company.upiId)}</div>` : ''}
    <div class="c" style="margin-top:4px;">Thank You! Visit Again</div>
    <script>window.onload = function(){ window.print(); setTimeout(function(){ window.close(); }, 300); };</script>
  </body></html>`;

  const w = window.open('', '_blank', 'width=380,height=650');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
