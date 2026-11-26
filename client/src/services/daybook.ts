import { StorageService } from './storageService';
import type { Invoice } from '../types';

export type DaybookEntry = {
    id: string; date: string; label: string; type: 'sale' | 'purchase' | 'received' | 'paid' | 'expense'; name: string;
    reference: string; amount: number; partyId?: string; invoice?: Invoice;
};

export function readDaybook(): DaybookEntry[] {
    const parties = new Map(StorageService.getCustomers().map(party => [party.id, party.company || party.name]));
    const voucherRow = (invoice: Invoice, type: 'sale' | 'purchase', label: string, sign = 1): DaybookEntry => ({
        id: `${type}:${invoice.id}`, date: invoice.date, type, label, name: invoice.customerName || 'Walk-in',
        reference: invoice.invoiceNumber, amount: sign * Math.abs(Number(invoice.total) || 0), partyId: invoice.customerId, invoice,
    });
    const vouchers = [
        ...StorageService.getInvoices().map(invoice => invoice.type === 'CREDIT_NOTE'
            ? voucherRow(invoice, 'sale', 'Sales return', -1) : voucherRow(invoice, 'sale', 'Sale')),
        ...StorageService.getPurchases().map(invoice => voucherRow(invoice, 'purchase', 'Purchase')),
        ...StorageService.getVouchersByType('DEBIT_NOTE').map(invoice => voucherRow(invoice, 'purchase', 'Purchase return', -1)),
    ].filter(row => row.invoice?.conversionStatus !== 'CANCELLED');
    const payments = StorageService.getPayments().map((payment): DaybookEntry => {
        const outgoing = payment.type === 'PAID';
        const status = payment.mode === 'CHEQUE' && payment.chequeStatus && payment.chequeStatus !== 'CLEARED'
            ? ` · Cheque ${payment.chequeStatus.toLowerCase()}` : '';
        return { id: `payment:${payment.id}`, date: payment.date, type: outgoing ? 'paid' : 'received',
            label: (outgoing ? 'Payment out' : 'Payment in') + status, name: parties.get(payment.customerId) || 'Walk-in',
            reference: payment.reference || payment.invoiceNumber || payment.mode.replace(/_/g, ' '),
            amount: Number(payment.amount) || 0, partyId: payment.customerId };
    });
    const expenses = StorageService.getExpenses().map((expense): DaybookEntry => ({
        id: `expense:${expense.id}`, date: expense.date, label: 'Expense', type: 'expense',
        name: expense.description || expense.category, reference: expense.invoiceRef || expense.category, amount: Number(expense.amount) || 0,
    }));
    return [...vouchers, ...payments, ...expenses].sort((a, b) => b.date.localeCompare(a.date));
}
