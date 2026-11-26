import React, { useState } from 'react';
import { ArrowLeft, Repeat, Plus, Play, Pause, Pencil, Trash2, Calendar } from 'lucide-react';
import { AutomatedBill } from '../types';
import { StorageService } from '../services/storageService';
import { formatDate } from '../utils/dateUtils';
import { currentBillingDate, parseBillingDate } from '../services/recurringBilling';
import { ConfirmationModal } from './ConfirmationModal';

interface AutomatedBillsProps {
  onBack?: () => void;
}

export const AutomatedBills: React.FC<AutomatedBillsProps> = ({ onBack }) => {
  const [bills, setBills] = useState<AutomatedBill[]>(() => StorageService.getAutomatedBills());
  const customers = StorageService.getCustomers().filter(customer => customer.type !== 'VENDOR');
  const products = StorageService.getProducts().filter((p) => !p.isArchived);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<AutomatedBill | null>(null);
  const [deleting, setDeleting] = useState<AutomatedBill | null>(null);
  const [formError, setFormError] = useState('');

  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<AutomatedBill['frequency']>('MONTHLY');
  const [nextRunDate, setNextRunDate] = useState(currentBillingDate);
  const [runResult, setRunResult] = useState<ReturnType<typeof StorageService.runDueAutomatedBills> | null>(null);

  const refresh = () => setBills(StorageService.getAutomatedBills());

  const openSchedule = (bill: AutomatedBill | null) => {
    const previousItem = bill?.items[0];
    setEditing(bill);
    setTitle(bill?.title ?? '');
    setCustomerId(bill?.customerId ?? '');
    setProductId(previousItem?.productId === 'recurring_service' ? '' : previousItem?.productId ?? '');
    setAmount(bill ? String(bill.total) : '');
    setFrequency(bill?.frequency ?? 'MONTHLY');
    setNextRunDate(bill?.nextRunDate ?? currentBillingDate());
    setFormError('');
    setShowAdd(true);
  };

  const hasMultipleItems = (editing?.items.length ?? 0) > 1;
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const cust = customers.find((c) => c.id === customerId);
    const prod = products.find((p) => p.id === productId);
    const val = Math.round(Number(amount) * 100) / 100;
    const date = parseBillingDate(nextRunDate);
    if (!cust || !title.trim() || !Number.isFinite(val) || val <= 0 || !date) {
      setFormError('Enter a schedule name, customer, positive amount and valid billing date.');
      return;
    }
    if (productId && !prod && !hasMultipleItems) {
      setFormError('Choose an available item or a custom line.');
      return;
    }
    const previousItem = editing?.items[0];
    const preserveItems = editing && (hasMultipleItems || (
      val === editing.total && (productId || 'recurring_service') === previousItem?.productId
    ));

    StorageService.saveAutomatedBill({
      ...editing,
      id: editing?.id ?? crypto.randomUUID(),
      title: title.trim(),
      customerId: cust.id,
      customerName: cust.company || cust.name,
      frequency,
      nextRunDate,
      billingDay: editing?.nextRunDate === nextRunDate
        ? editing.billingDay ?? date.getUTCDate()
        : date.getUTCDate(),
      active: editing?.active ?? true,
      items: preserveItems ? editing.items : [
        {
          productId: prod?.id || 'recurring_service',
          description: prod?.name || title.trim() || 'Monthly Retainer / Subscription',
          quantity: 1,
          rate: val,
          baseAmount: val,
          gstRate: prod?.gstRate || 0,
          totalAmount: val,
        },
      ],
      gstEnabled: editing?.gstEnabled ?? true,
      total: val,
      generatedCount: editing?.generatedCount ?? 0,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    });
    setShowAdd(false);
    refresh();
  };

  const handleRunDue = () => {
    setRunResult(StorageService.runDueAutomatedBills());
    refresh();
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
              <Repeat className="w-5 h-5 text-blue-600" />
              Automated / Recurring Bills
            </h1>
            <p className="text-xs text-slate-500">Bills run when Dashboard opens or when you select Run Due Now.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handleRunDue} className="px-3.5 py-2 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center gap-1">
            <Play className="w-3.5 h-3.5" /> Run Due Now
          </button>
          <button type="button" onClick={() => openSchedule(null)} className="px-3.5 py-2 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center gap-1">
            <Plus className="w-4 h-4" /> New Schedule
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-3">
        {runResult && (
          <div role="status" className="space-y-1 rounded-2xl border bg-card p-3 text-sm">
            <p className="font-semibold">{runResult.created || runResult.recovered || runResult.issues.length
              ? `Invoices created: ${runResult.created}. Existing invoices recovered: ${runResult.recovered}.`
              : 'No recurring schedules due today.'}</p>
            {runResult.issues.length > 0 && <ul className="list-disc pl-5 text-red-700 dark:text-red-400">
              {runResult.issues.map((issue, idx) => <li key={idx}>{issue}</li>)}
            </ul>}
          </div>
        )}

        {bills.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center text-slate-400">
            No recurring billing schedules created yet.
          </div>
        ) : (
          bills.map((b) => (
            <div key={b.id} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black">{b.title}</h3>
                <p className="text-xs text-slate-500">
                  {b.customerName} · {b.frequency} · Next: <Calendar className="w-3 h-3 inline" /> {formatDate(b.nextRunDate)}
                </p>
                <p className="text-[11px] text-slate-500">{b.active ? 'Active' : 'Paused'} · {b.generatedCount || 0} invoices generated</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-base font-black text-blue-600">₹{b.total.toLocaleString('en-IN')}</span>
                <button type="button" aria-label={b.active ? 'Pause schedule' : 'Resume schedule'} title={b.active ? 'Pause schedule' : 'Resume schedule'}
                  onClick={() => { StorageService.saveAutomatedBill({ ...b, active: !b.active }); refresh(); }} className="rounded-xl border p-2">
                  {b.active ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button type="button" aria-label="Edit schedule" title="Edit schedule" onClick={() => openSchedule(b)} className="rounded-xl border p-2">
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Remove schedule"
                  onClick={() => setDeleting(b)}
                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={handleSave} aria-label={editing ? 'Edit recurring schedule' : 'New recurring schedule'} className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-md max-h-[90dvh] overflow-y-auto space-y-3">
            <h3 className="text-lg font-black">{editing ? 'Edit recurring schedule' : 'New recurring schedule'}</h3>
            <input required aria-label="Schedule name" placeholder="Schedule name" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold" />
            <select required aria-label="Customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">
              <option value="">Select Party...</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
            </select>
            <select aria-label="Product or service" disabled={hasMultipleItems} value={productId} onChange={(e) => {
              setProductId(e.target.value);
              const found = products.find((p) => p.id === e.target.value);
              if (found && !amount) setAmount(String(found.price));
            }} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm">
              <option value="">Custom Item / Retainer</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} (₹{p.price})</option>)}
            </select>
            {hasMultipleItems && <p className="text-xs text-muted-foreground">This schedule keeps its existing line items and total.</p>}
            <div className="grid grid-cols-2 gap-2">
              <input required readOnly={hasMultipleItems} aria-label="Amount per bill" min="0.01" step="0.01" type="number" placeholder="Amount ₹" value={amount} onChange={(e) => setAmount(e.target.value)} className="min-w-0 p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold" />
              <select aria-label="Repeat interval" value={frequency} onChange={(e) => setFrequency(e.target.value as AutomatedBill['frequency'])} className="min-w-0 p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>
            <input type="date" required aria-label="Next billing date" value={nextRunDate} onChange={(e) => setNextRunDate(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold" />
            {formError && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{formError}</p>}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-xs">Cancel</button>
              <button type="submit" className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-xs">Save Schedule</button>
            </div>
          </form>
        </div>
      )}
      <ConfirmationModal
        isOpen={Boolean(deleting)}
        title="Remove recurring schedule?"
        message="This stops future bills for the schedule. Already generated invoices stay in Sales."
        variant="danger"
        confirmText="Remove schedule"
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          StorageService.deleteAutomatedBill(deleting.id);
          setDeleting(null);
          refresh();
        }}
      />
    </div>
  );
};

export default AutomatedBills;
