import React, { useState } from 'react';
import { ArrowLeft, Warehouse, Plus, ArrowLeftRight } from 'lucide-react';
import { Godown, GodownTransfer, Product } from '../types';
import { StorageService } from '../services/storageService';
import { formatDate } from '../utils/dateUtils';

interface GodownManagerProps {
  onBack?: () => void;
}

export const GodownManager: React.FC<GodownManagerProps> = ({ onBack }) => {
  const [godowns, setGodowns] = useState<Godown[]>(() => StorageService.ensureDefaultGodown());
  const [transfers, setTransfers] = useState<GodownTransfer[]>(() => StorageService.getGodownTransfers());
  const [products, setProducts] = useState<Product[]>(() => StorageService.getProducts().filter((p) => !p.isArchived));
  const [showAdd, setShowAdd] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [fromId, setFromId] = useState('godown_main');
  const [toId, setToId] = useState('');
  const [prodId, setProdId] = useState('');
  const [qty, setQty] = useState('1');

  const refresh = () => {
    setGodowns(StorageService.ensureDefaultGodown());
    setTransfers(StorageService.getGodownTransfers());
    setProducts(StorageService.getProducts().filter((p) => !p.isArchived));
  };

  const handleAddGodown = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    StorageService.saveGodown({
      id: crypto.randomUUID(),
      name: name.trim(),
      address: address.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    setShowAdd(false);
    setName('');
    setAddress('');
    refresh();
  };

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const prod = products.find((p) => p.id === prodId);
    const numQty = Number(qty) || 0;
    if (!prod || !toId || fromId === toId || numQty <= 0) return;
    StorageService.transferStockBetweenGodowns({
      transferNumber: `GT-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().split('T')[0],
      fromGodownId: fromId,
      toGodownId: toId,
      items: [{ productId: prod.id, productName: prod.name, quantity: numQty }],
    });
    setShowTransfer(false);
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
              <Warehouse className="w-5 h-5 text-indigo-600" />
              Godowns &amp; Warehouses
            </h1>
            <p className="text-xs text-slate-500">Multi-location stock control &amp; inter-godown transfer</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setShowTransfer(true)} className="px-3.5 py-2 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold flex items-center gap-1">
            <ArrowLeftRight className="w-4 h-4 text-indigo-600" /> Transfer
          </button>
          <button type="button" onClick={() => setShowAdd(true)} className="px-3.5 py-2 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center gap-1">
            <Plus className="w-4 h-4" /> Add Godown
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {godowns.map((g) => {
            const totalQty = products.reduce((s, p) => s + Number(p.godownStocks?.[g.id] ?? (g.isMain ? p.stock : 0)), 0);
            return (
              <div key={g.id} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">{g.isMain ? 'Primary' : 'Branch Godown'}</span>
                <h3 className="text-base font-black mt-1">{g.name}</h3>
                {g.address && <p className="text-xs text-slate-500">{g.address}</p>}
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-2">Total Units: {totalQty}</p>
              </div>
            );
          })}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Recent Stock Transfers</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {transfers.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-400">No inter-godown transfers recorded.</p>
            ) : (
              transfers.map((t) => (
                <div key={t.id} className="px-5 py-3 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-slate-800 dark:text-white">
                      {t.items.map((i) => `${i.productName} (${i.quantity})`).join(', ')}
                    </p>
                    <p className="text-slate-500">
                      {godowns.find((g) => g.id === t.fromGodownId)?.name || t.fromGodownId} &rarr;{' '}
                      {godowns.find((g) => g.id === t.toGodownId)?.name || t.toGodownId} · {formatDate(t.date)}
                    </p>
                  </div>
                  <span className="font-mono font-bold text-indigo-600">{t.transferNumber}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={handleAddGodown} className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-md space-y-3">
            <h3 className="text-lg font-black">New Godown / Warehouse</h3>
            <input required placeholder="Godown Name" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold" />
            <input placeholder="Address / Location" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm" />
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-xs">Cancel</button>
              <button type="submit" className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold text-xs">Create</button>
            </div>
          </form>
        </div>
      )}

      {showTransfer && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={handleTransfer} className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-md space-y-3">
            <h3 className="text-lg font-black">Transfer Stock</h3>
            <select required value={prodId} onChange={(e) => setProdId(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">
              <option value="">Select Product...</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock})</option>)}
            </select>
            <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">
              {godowns.map((g) => <option key={g.id} value={g.id}>From: {g.name}</option>)}
            </select>
            <select required value={toId} onChange={(e) => setToId(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">
              <option value="">To Godown...</option>
              {godowns.map((g) => <option key={g.id} value={g.id}>To: {g.name}</option>)}
            </select>
            <input required type="number" min={1} placeholder="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold" />
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowTransfer(false)} className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-xs">Cancel</button>
              <button type="submit" className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold text-xs">Transfer</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default GodownManager;
