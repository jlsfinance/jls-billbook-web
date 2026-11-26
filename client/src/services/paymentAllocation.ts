import type { Invoice, Payment, PaymentAllocation } from '../types';

export function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function getPaymentAllocations(payment: Payment): PaymentAllocation[] {
  return payment.allocations ?? (payment.invoiceId
    ? [{ invoiceId: payment.invoiceId, invoiceNumber: payment.invoiceNumber || '', amount: payment.amount }]
    : []);
}

export function getInvoicePaid(invoice: Invoice) {
  return Number(invoice.paidAmount ?? invoice.amountReceived ?? (invoice.status === 'PAID' ? invoice.total : 0));
}
