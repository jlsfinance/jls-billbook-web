import { useState } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { StorageService } from '../services/storageService';
import type { Invoice } from '../types';
import AccountantPacketManager from './AccountantPacketManager';

function localDate(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function dateKey(date: string) {
  const match = /^\d{4}-\d{2}-\d{2}/.exec(date);
  if (match) return match[0];
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '' : localDate(parsed);
}

function voucherRows(records: Invoice[]) {
  return records.map(record => ({
    'Document number': record.invoiceNumber,
    Date: dateKey(record.date),
    Party: record.customerName,
    'Party GSTIN': record.customerGstin || '',
    'Document subtotal': record.subtotal,
    CGST: record.totalCgst ?? '',
    SGST: record.totalSgst ?? '',
    IGST: record.totalIgst ?? '',
    'Document total': record.total,
    Status: record.status,
  }));
}

function buildExport(from: string, to: string) {
  const inPeriod = ({ date }: { date: string }) => {
    const key = dateKey(date);
    return key >= from && key <= to;
  };
  const company = StorageService.getCompanyProfile();
  const parties = new Map(StorageService.getCustomers().map(party => [party.id, party.name]));
  const invoices = StorageService.getInvoices().filter(inPeriod);
  const sales = invoices.filter(invoice => invoice.type !== 'CREDIT_NOTE');
  const creditNotes = invoices.filter(invoice => invoice.type === 'CREDIT_NOTE');
  const purchases = StorageService.getPurchases().filter(inPeriod);
  const debitNotes = StorageService.getVouchersByType('DEBIT_NOTE').filter(inPeriod);
  const payments = StorageService.getPayments().filter(inPeriod);
  const expenses = StorageService.getExpenses().filter(inPeriod);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Company', company.name],
    ['GSTIN', company.gstin || company.gst || ''],
    ['From', from],
    ['To', to],
    ['Amounts', 'Amounts as recorded in each document. Credit and debit notes are on separate sheets.'],
    ['Payments', 'Payments are listed separately from invoices and may relate to invoices outside this period.'],
  ]), 'Export details');

  for (const [name, records] of [
    ['Sales', sales],
    ['Purchases', purchases],
    ['Credit notes', creditNotes],
    ['Debit notes', debitNotes],
  ] as const) {
    const header = ['Document number', 'Date', 'Party', 'Party GSTIN', 'Document subtotal', 'CGST', 'SGST', 'IGST', 'Document total', 'Status'];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(voucherRows(records), { header }), name);
  }

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(payments.map(payment => ({
    Date: dateKey(payment.date),
    Party: parties.get(payment.customerId) || payment.customerId,
    Type: payment.type || 'RECEIVED',
    Mode: payment.mode,
    Amount: payment.amount,
    Reference: payment.reference || '',
    'Invoice number': payment.invoiceNumber || '',
  })), { header: ['Date', 'Party', 'Type', 'Mode', 'Amount', 'Reference', 'Invoice number'] }), 'Payments');

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(expenses.map(expense => ({
    Date: dateKey(expense.date),
    Category: expense.category,
    Vendor: expense.vendorName || '',
    GSTIN: expense.vendorGstin || '',
    Description: expense.description || '',
    Amount: expense.amount,
    GST: expense.gstAmount ?? '',
    Reference: expense.invoiceRef || '',
  })), { header: ['Date', 'Category', 'Vendor', 'GSTIN', 'Description', 'Amount', 'GST', 'Reference'] }), 'Expenses');

  return workbook;
}

export default function AccountantExport({ onBack }: { onBack: () => void }) {
  const [from, setFrom] = useState(() => {
    const now = new Date();
    return localDate(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [to, setTo] = useState(() => localDate(new Date()));
  const [error, setError] = useState('');

  function download(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!from || !to || from > to) {
      setError('Select a valid date range.');
      return;
    }
    try {
      XLSX.writeFile(buildExport(from, to), `JLS-Accountant-${from}-to-${to}.xlsx`);
    } catch {
      setError('The workbook could not be downloaded. Try again.');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 pb-24 sm:p-8">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400">
        <ArrowLeft size={16} /> Back
      </button>
      <div>
        <h1 className="text-2xl font-bold">Accountant export</h1>
        <p className="mt-1 text-sm text-muted-foreground">Download the current company's records for a selected period.</p>
      </div>
      <form onSubmit={download} className="space-y-5 rounded-2xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">From
            <input required type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} className="rounded-lg border bg-background p-2.5" />
          </label>
          <label className="grid gap-2 text-sm font-medium">To
            <input required type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} className="rounded-lg border bg-background p-2.5" />
          </label>
        </div>
        <p className="text-sm text-muted-foreground">Includes sales, purchases, credit notes, debit notes, payments and expenses.</p>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
          <Download size={16} /> Download Excel workbook
        </button>
      </form>
      <AccountantPacketManager from={from} to={to} workbook={() => XLSX.write(buildExport(from, to), { bookType: 'xlsx', type: 'base64' })} />
    </div>
  );
}
