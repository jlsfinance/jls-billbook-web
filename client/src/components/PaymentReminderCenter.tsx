import React, { useMemo } from 'react';
import { ArrowLeft, BellRing, MessageCircle, Clock } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { WhatsAppService } from '../services/whatsappService';

interface PaymentReminderCenterProps {
  onBack?: () => void;
}

export const PaymentReminderCenter: React.FC<PaymentReminderCenterProps> = ({ onBack }) => {
  const company = StorageService.getCompanyProfile();
  const receivables = useMemo(() => {
    const customers = StorageService.getCustomers();
    const invoices = StorageService.getInvoices();
    const now = Date.now();

    return customers
      .filter((c) => c.balance > 0)
      .map((c) => {
        const unpaid = invoices.filter((i) => i.customerId === c.id && i.status !== 'PAID' && i.type !== 'CREDIT_NOTE');
        const oldestDue = unpaid.sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date))[0];
        const overdueDays = oldestDue
          ? Math.max(0, Math.floor((now - new Date(oldestDue.dueDate || oldestDue.date).getTime()) / 86400000))
          : 0;
        return { customer: c, overdueDays, latestRef: oldestDue?.invoiceNumber };
      })
      .sort((a, b) => b.customer.balance - a.customer.balance);
  }, []);

  const totalDue = receivables.reduce((s, r) => s + r.customer.balance, 0);

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
              <BellRing className="w-5 h-5 text-emerald-600" />
              Payment Reminders (Udhaar Recovery)
            </h1>
            <p className="text-xs text-slate-500">Send 1-tap WhatsApp &amp; UPI payment reminders</p>
          </div>
        </div>
        <span className="px-3 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-black">
          Total Due: ₹{totalDue.toLocaleString('en-IN')}
        </span>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-3">
        {receivables.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center text-slate-400">
            All parties settled! Zero overdue receivables.
          </div>
        ) : (
          receivables.map(({ customer, overdueDays, latestRef }) => (
            <div key={customer.id} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">{customer.company || customer.name}</h3>
                <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                  <span>{customer.phone || 'No phone number'}</span>
                  {overdueDays > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold text-[10px]">
                      <Clock className="w-3 h-3" /> {overdueDays}d overdue
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-base font-black text-rose-600">₹{customer.balance.toLocaleString('en-IN')}</p>
                  {latestRef && <p className="text-[10px] text-slate-400">Ref #{latestRef}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => WhatsAppService.sharePaymentReminder(customer, company, customer.balance, latestRef)}
                  className="px-3.5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <MessageCircle className="w-4 h-4" /> Remind
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PaymentReminderCenter;
