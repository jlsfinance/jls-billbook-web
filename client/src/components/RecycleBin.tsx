import React, { useState } from 'react';
import { ArrowLeft, Trash2, RotateCcw } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { formatDate } from '../utils/dateUtils';

interface RecycleBinProps {
  onBack?: () => void;
}

export const RecycleBin: React.FC<RecycleBinProps> = ({ onBack }) => {
  const [deleted, setDeleted] = useState(() => StorageService.getDeletedItems());

  const refresh = () => setDeleted(StorageService.getDeletedItems());

  const rows: {
    kind: 'INVOICE' | 'PURCHASE' | 'PAYMENT' | 'EXPENSE';
    id: string;
    title: string;
    subtitle: string;
    amount: number;
  }[] = [
    ...deleted.invoices.map((i) => ({
      kind: 'INVOICE' as const,
      id: i.id,
      title: `${i.type || 'SALE'} #${i.invoiceNumber} — ${i.customerName}`,
      subtitle: `Deleted ${i.deletedAt ? formatDate(i.deletedAt) : formatDate(i.date)}`,
      amount: i.total,
    })),
    ...deleted.purchases.map((p) => ({
      kind: 'PURCHASE' as const,
      id: p.id,
      title: `${p.type || 'PURCHASE'} #${p.invoiceNumber} — ${p.customerName}`,
      subtitle: `Deleted ${p.deletedAt ? formatDate(p.deletedAt) : formatDate(p.date)}`,
      amount: p.total,
    })),
    ...deleted.payments.map((p) => ({
      kind: 'PAYMENT' as const,
      id: p.id,
      title: `Payment (${p.type || 'RECEIVED'}) · ${p.mode}`,
      subtitle: `Deleted ${p.deletedAt ? formatDate(p.deletedAt) : formatDate(p.date)}`,
      amount: p.amount,
    })),
    ...deleted.expenses.map((e) => ({
      kind: 'EXPENSE' as const,
      id: e.id,
      title: `Expense: ${e.category}`,
      subtitle: `Deleted ${e.deletedAt ? formatDate(e.deletedAt) : formatDate(e.date)}`,
      amount: e.amount,
    })),
  ];

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
              <Trash2 className="w-5 h-5 text-rose-600" />
              Recycle Bin ({rows.length})
            </h1>
            <p className="text-xs text-slate-500">Recover accidentally deleted vouchers, payments or expenses</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-3">
        {rows.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center text-slate-400">
            Recycle bin is empty.
          </div>
        ) : (
          rows.map((r) => (
            <div key={`${r.kind}-${r.id}`} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black">{r.title}</h3>
                <p className="text-xs text-slate-500">{r.subtitle} · ₹{r.amount.toLocaleString('en-IN')}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    StorageService.restoreDeletedItem(r.kind, r.id);
                    refresh();
                  }}
                  className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Restore
                </button>
                <button
                  type="button"
                  onClick={() => {
                    StorageService.permanentlyDeleteItem(r.kind, r.id);
                    refresh();
                  }}
                  className="px-3 py-1.5 rounded-full bg-rose-50 text-rose-600 text-xs font-bold"
                >
                  Delete Forever
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RecycleBin;
