import React, { useMemo, useState } from 'react';
import { ArrowLeft, Search, Plus, Minus, Trash2, Printer, CheckCircle2, Barcode } from 'lucide-react';
import { Invoice, InvoiceItem, Product } from '../types';
import { StorageService } from '../services/storageService';
import BarcodeScanField from './BarcodeScanField';
import ThermalReceiptModal from './ThermalReceiptModal';
import { HapticService } from '../services/hapticService';

interface POSBillingProps {
  onBack: () => void;
}

export const POSBilling: React.FC<POSBillingProps> = ({ onBack }) => {
  const company = StorageService.getCompanyProfile();
  const products = useMemo(() => StorageService.getProducts().filter((p) => !p.isArchived), []);
  const customers = useMemo(() => StorageService.getCustomers(), []);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('ALL');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [cart, setCart] = useState<InvoiceItem[]>([]);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'ONLINE' | 'CREDIT'>('CASH');
  const [splitCash, setSplitCash] = useState<string>('');
  const [splitOnline, setSplitOnline] = useState<string>('');
  const [savedInvoice, setSavedInvoice] = useState<Invoice | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>(['ALL']);
    products.forEach((p) => { if (p.category) set.add(p.category); });
    return Array.from(set);
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const catOk = category === 'ALL' || p.category === category;
      const qOk = !q || p.name.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q);
      return catOk && qOk;
    });
  }, [products, category, search]);

  const addItem = (prod: Product) => {
    HapticService.light();
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.productId === prod.id);
      if (idx >= 0) {
        const next = [...prev];
        const qty = next[idx].quantity + 1;
        const rate = next[idx].rate;
        const base = qty * rate;
        const gst = company.gst_enabled ? base * ((prod.gstRate || 0) / 100) : 0;
        next[idx] = {
          ...next[idx],
          quantity: qty,
          baseAmount: base,
          cgstAmount: gst / 2,
          sgstAmount: gst / 2,
          igstAmount: 0,
          totalAmount: base + gst,
        };
        return next;
      }
      const gst = company.gst_enabled ? prod.price * ((prod.gstRate || 0) / 100) : 0;
      return [
        ...prev,
        {
          productId: prod.id,
          barcodeSnapshot: prod.barcode,
          description: prod.name,
          quantity: 1,
          unit: prod.unit || 'pcs',
          rate: prod.price,
          baseAmount: prod.price,
          hsn: prod.hsn || '',
          gstRate: prod.gstRate || 0,
          cgstAmount: gst / 2,
          sgstAmount: gst / 2,
          igstAmount: 0,
          totalAmount: prod.price + gst,
        },
      ];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId !== productId) return item;
          const nextQty = item.quantity + delta;
          if (nextQty <= 0) return null;
          const base = nextQty * item.rate;
          const gst = company.gst_enabled ? base * ((item.gstRate || 0) / 100) : 0;
          return {
            ...item,
            quantity: nextQty,
            baseAmount: base,
            cgstAmount: gst / 2,
            sgstAmount: gst / 2,
            totalAmount: base + gst,
          };
        })
        .filter(Boolean) as InvoiceItem[]
    );
  };

  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, i) => s + i.baseAmount, 0);
    const cgst = cart.reduce((s, i) => s + (i.cgstAmount || 0), 0);
    const sgst = cart.reduce((s, i) => s + (i.sgstAmount || 0), 0);
    const total = Math.round(cart.reduce((s, i) => s + (i.totalAmount || i.baseAmount), 0) * 100) / 100;
    return { subtotal, cgst, sgst, total };
  }, [cart]);

  const handleCheckout = (printAfter: boolean) => {
    if (cart.length === 0) return;
    let cust = customers.find((c) => c.id === selectedCustomerId);
    if (!cust) {
      cust = customers.find((c) => c.name.toUpperCase() === 'CASH');
      if (!cust) {
        cust = {
          id: crypto.randomUUID(),
          name: 'CASH',
          company: 'Walk-in Counter',
          email: '',
          phone: '',
          address: '',
          balance: 0,
          notifications: [],
        };
        StorageService.saveCustomer(cust);
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const cashSplit = Number(splitCash) || 0;
    const onlineSplit = Number(splitOnline) || 0;
    const paidAmount = paymentMode === 'CREDIT' ? cashSplit + onlineSplit : totals.total;

    const inv: Invoice = {
      id: crypto.randomUUID(),
      type: 'SALE',
      invoiceNumber: StorageService.generateVoucherNumber('SALE', today, cust.id),
      customerId: cust.id,
      customerName: cust.company || cust.name,
      customerAddress: cust.address || '',
      customerGstin: cust.gstin,
      date: today,
      dueDate: today,
      items: cart,
      subtotal: Math.round(totals.subtotal * 100) / 100,
      totalCgst: Math.round(totals.cgst * 100) / 100,
      totalSgst: Math.round(totals.sgst * 100) / 100,
      totalIgst: 0,
      gstEnabled: Boolean(company.gst_enabled),
      total: totals.total,
      paidAmount,
      amountReceived: paidAmount,
      balanceDue: Math.max(0, totals.total - paidAmount),
      splitCashAmount: cashSplit || undefined,
      splitOnlineAmount: onlineSplit || undefined,
      status: paidAmount >= totals.total ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'PENDING',
      paymentMode,
      accountId: paymentMode === 'CASH' ? 'cash_default' : 'bank_default',
    };

    StorageService.saveInvoice(inv);
    HapticService.heavy();
    setCart([]);
    setSplitCash('');
    setSplitOnline('');
    if (printAfter) setSavedInvoice(inv);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 flex flex-col">
      <div className="sticky top-0 z-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Barcode className="w-5 h-5 text-blue-600" />
              POS Counter Billing
            </h1>
            <p className="text-xs text-slate-500">1-tap counter checkout &amp; instant thermal slip</p>
          </div>
        </div>
        <select
          value={selectedCustomerId}
          onChange={(e) => setSelectedCustomerId(e.target.value)}
          className="bg-slate-100 dark:bg-slate-800 text-xs font-bold px-3 py-2 rounded-xl max-w-[160px]"
        >
          <option value="">Walk-in (Cash)</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.company || c.name}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 max-w-6xl w-full mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Product Grid */}
        <div className="lg:col-span-7 space-y-3">
          <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
            <BarcodeScanField
              label="Quick Scan"
              placeholder="Scan barcode to add directly..."
              onScan={(code) => {
                const hit = StorageService.findProductByBarcode(code);
                if (hit) addItem(hit);
              }}
            />
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter items..."
                className="w-full pl-9 pr-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm font-medium outline-none"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-1">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                    category === c ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[480px] overflow-y-auto">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addItem(p)}
                className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-left hover:border-blue-500 transition-all active:scale-95"
              >
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{p.name}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm font-black text-blue-600">₹{p.price}</span>
                  <span className="text-[10px] font-bold text-slate-400">Qty: {p.stock}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Cart */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-500 mb-3">
              Current Counter Bill ({cart.length} items)
            </h2>
            <div className="max-h-[260px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {cart.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-12">Tap an item or scan barcode to start billing</p>
              ) : (
                cart.map((item) => (
                  <div key={item.productId} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{item.description}</p>
                      <p className="text-xs text-slate-500">₹{item.rate} × {item.quantity}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => updateQty(item.productId, -1)} className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><Minus className="w-3.5 h-3.5" /></button>
                      <span className="text-xs font-black w-6 text-center">{item.quantity}</span>
                      <button type="button" onClick={() => updateQty(item.productId, 1)} className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => updateQty(item.productId, -item.quantity)} className="p-1 text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3 mt-4">
            <div className="grid grid-cols-3 gap-2">
              {(['CASH', 'ONLINE', 'CREDIT'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMode(m)}
                  className={`py-2 rounded-xl text-xs font-bold border ${
                    paymentMode === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {m === 'ONLINE' ? 'UPI / Card' : m}
                </button>
              ))}
            </div>

            {paymentMode === 'CREDIT' && (
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Part Cash ₹" value={splitCash} onChange={(e) => setSplitCash(e.target.value)} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold" />
                <input type="number" placeholder="Part UPI ₹" value={splitOnline} onChange={(e) => setSplitOnline(e.target.value)} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold" />
              </div>
            )}

            <div className="flex justify-between items-center text-lg font-black">
              <span>Payable Total</span>
              <span className="text-blue-600">₹{totals.total.toLocaleString('en-IN')}</span>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => handleCheckout(false)}
                className="flex-1 py-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <CheckCircle2 className="w-4 h-4" /> Save
              </button>
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => handleCheckout(true)}
                className="flex-[2] py-3.5 rounded-2xl bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg disabled:opacity-40"
              >
                <Printer className="w-4 h-4" /> Save &amp; Thermal Print
              </button>
            </div>
          </div>
        </div>
      </div>

      {savedInvoice && (
        <ThermalReceiptModal
          invoice={savedInvoice}
          company={company}
          onClose={() => setSavedInvoice(null)}
        />
      )}
    </div>
  );
};

export default POSBilling;
