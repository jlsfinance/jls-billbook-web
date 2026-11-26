
import { Invoice, Payment, CompanyProfile, Customer } from '../types';

const getBaseOrigin = () => {
  if (typeof window !== 'undefined' && window.location?.origin && !window.location.origin.startsWith('capacitor://') && !window.location.origin.startsWith('file://')) {
    return window.location.origin;
  }
  return 'https://git-import.vercel.app';
};

export const WhatsAppService = {
  buildPublicBillUrl: (invoice: Invoice): string => {
    const base = `${getBaseOrigin()}/view/${invoice.id}`;
    return invoice.publicToken ? `${base}?token=${encodeURIComponent(invoice.publicToken)}` : base;
  },

  shareInvoice: (invoice: Invoice, customer: Customer | undefined, company: CompanyProfile, manualPhoneNumber?: string) => {
    let phone = (manualPhoneNumber || customer?.phone || '').replace(/\D/g, '');

    if (!phone) {
      return alert("Please provide a mobile number.");
    }

    if (phone.length < 10) return alert("Please enter a valid 10-digit mobile number.");

    const itemsSummary = invoice.items.map(i =>
      `- ${i.description} - ${i.quantity} x ₹${i.rate.toFixed(2)} = ₹${(i.totalAmount || 0).toFixed(2)}`
    ).join('%0A');

    const invoiceLink = WhatsAppService.buildPublicBillUrl(invoice);
    const ledgerLink = customer ? `${getBaseOrigin()}/customer/${customer.id}/ledger` : '';
    const docLabel = invoice.type === 'QUOTATION'
      ? 'QUOTATION / ESTIMATE'
      : invoice.type === 'PROFORMA'
        ? 'PROFORMA INVOICE'
        : invoice.type === 'DELIVERY_CHALLAN'
          ? 'DELIVERY CHALLAN'
          : invoice.type === 'CREDIT_NOTE'
            ? 'CREDIT NOTE'
            : invoice.type === 'DEBIT_NOTE'
              ? 'DEBIT NOTE'
              : 'TAX INVOICE';

    const message = `*${docLabel}* %0A` +
      `*${company.name}* %0A%0A` +
      `Hello ${customer?.company || customer?.name || 'Customer'}, %0A` +
      `Here are your document details: %0A%0A` +
      `*No:* ${invoice.invoiceNumber} %0A` +
      `*Date:* ${invoice.date} %0A` +
      `*Bill Amount:* Rs. ${invoice.total.toFixed(2)} %0A` +
      (invoice.previousBalance && invoice.previousBalance > 0 ? `*Prev. Balance:* Rs. ${invoice.previousBalance.toFixed(2)} %0A` : '') +
      (invoice.previousBalance && invoice.previousBalance > 0 ? `*Net Total Due:* Rs. ${(invoice.total + invoice.previousBalance).toFixed(2)} %0A` : '') +
      `*Status:* ${invoice.status === 'PAID' ? 'PAID ✅' : invoice.status === 'PARTIAL' ? 'PARTIAL' : 'PENDING ⏳'} %0A%0A` +
      `*Items:* %0A${itemsSummary} %0A%0A` +
      `📄 *View Document:* ${invoiceLink} %0A` +
      `📒 *View Ledger:* ${customer ? ledgerLink : 'N/A'} %0A%0A` +
      `Thank you for your business!`;

    const waPhone = phone.length === 10 ? `91${phone}` : phone;
    window.open(`https://wa.me/${waPhone}?text=${message}`, '_blank');
  },

  sharePayment: (payment: Payment, customer: Customer | undefined, company: CompanyProfile, manualPhoneNumber?: string) => {
    if (!customer) return alert("Customer data not found.");

    const phone = (manualPhoneNumber || customer.phone || '').replace(/\D/g, '');
    if (!phone) return alert("Please provide a mobile number.");

    const ledgerLink = `${getBaseOrigin()}/customer/${customer.id}/ledger`;

    const message = `*PAYMENT RECEIPT* %0A` +
      `*${company.name}* %0A%0A` +
      `Hello ${customer.company || customer.name}, %0A` +
      `We have recorded your payment. %0A%0A` +
      `*Amount:* Rs. ${payment.amount.toFixed(2)} %0A` +
      `*Date:* ${payment.date} %0A` +
      `*Mode:* ${payment.mode} %0A` +
      `*Ref:* ${payment.reference || 'N/A'} %0A%0A` +
      `*Current Balance:* Rs. ${customer.balance.toFixed(2)} %0A%0A` +
      `📒 *View Ledger:* ${ledgerLink} %0A%0A` +
      `Thank you!`;

    const waPhone = phone.length === 10 ? `91${phone}` : phone;
    window.open(`https://wa.me/${waPhone}?text=${message}`, '_blank');
  },

  sharePaymentReminder: (
    customer: Customer,
    company: CompanyProfile,
    overdueAmount?: number,
    invoiceRef?: string
  ) => {
    const phone = (customer.phone || '').replace(/\D/g, '');
    if (!phone) return alert('Customer mobile number is missing.');
    const due = Math.max(0, overdueAmount ?? customer.balance ?? 0);
    const upiLine = company.upiId
      ? `%0A💳 *Pay via UPI:* upi://pay?pa=${encodeURIComponent(company.upiId)}&pn=${encodeURIComponent(company.name)}&am=${due.toFixed(2)}&cu=INR`
      : '';
    const refLine = invoiceRef ? `*Ref Bill:* ${invoiceRef} %0A` : '';
    const msg =
      `*PAYMENT REMINDER* %0A` +
      `*${company.name}* %0A%0A` +
      `Namaste ${customer.company || customer.name}, %0A` +
      `Friendly reminder regarding your pending balance of *Rs. ${due.toLocaleString('en-IN', { maximumFractionDigits: 2 })}*. %0A` +
      refLine +
      upiLine +
      `%0A%0AKindly clear the payment at your earliest convenience. Thank you!`;
    const waPhone = phone.length === 10 ? `91${phone}` : phone;
    window.open(`https://wa.me/${waPhone}?text=${msg}`, '_blank');
  }
};
