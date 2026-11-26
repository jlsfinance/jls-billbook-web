import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Layers,
  IndianRupee,
  Boxes,
} from 'lucide-react';
import { Product, StockEntry, StockEntryItem } from '../types';
import { StorageService } from '../services/storageService';
import { lookupBarcode } from '../services/barcodeService';
import type { BarcodeSource } from '../services/barcodeService';
import BarcodeScanField from './BarcodeScanField';
import { HapticService } from '../services/hapticService';

interface StockInProps {
  onBack: () => void;
}

interface DraftLine {
  productId: string;
  barcode?: string;
  name: string;
  quantity: number;
  unitCost?: number;
  currentStock: number;
  unit: string;
}

interface NewProductDraft {
  barcode: string;
  name: string;
  price: string;
  category: string;
  purchasePrice: string;
  gstRate: string;
  hsn: string;
  unit: string;
  lowStockThreshold: string;
  quantity: string;
}

const emptyNewProduct = (barcode: string): NewProductDraft => ({
  barcode,
  name: '',
  price: '',
  category: 'General',
  purchasePrice: '',
  gstRate: '',
  hsn: '',
  unit: 'pcs',
  lowStockThreshold: '',
  quantity: '1',
});

/**
 * Multi-scan Stock-In session.
 *
 * Scan-first: the barcode box is the primary action and holds focus. Scanning a
 * known product auto-fills everything already saved in the product master
 * (name, price, purchase price, GST, HSN, unit) — only the quantity to add is
 * asked for. Fields that were never saved stay blank; nothing is faked.
 */
const StockIn: React.FC<StockInProps> = ({ onBack }) => {
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [lastScan, setLastScan] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string; itemId?: string } | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [archivedHit, setArchivedHit] = useState<Product | null>(null);
  const [newProduct, setNewProduct] = useState<NewProductDraft | null>(null);

  const [supplier, setSupplier] = useState('');
  const [supplierInvoice, setSupplierInvoice] = useState('');
  const [note, setNote] = useState('');
  const [savedEntry, setSavedEntry] = useState<StockEntry | null>(null);

  const totalUnits = useMemo(() => lines.reduce((a, l) => a + (Number(l.quantity) || 0), 0), [lines]);
  const totalValue = useMemo(
    () => lines.reduce((a, l) => a + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0),
    [lines]
  );

  const pushLine = (line: DraftLine, message: string) => {
    setLines(prev => {
      const idx = prev.findIndex(l => l.productId === line.productId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + line.quantity };
        return copy;
      }
      return [...prev, line];
    });
    setStatusMsg({ kind: 'ok', text: message, itemId: line.productId });
    HapticService.light?.();
  };

  const handleScan = (barcode: string, source: BarcodeSource) => {
    const started = Date.now();
    setNotFound(null);
    setArchivedHit(null);

    const products = StorageService.getProducts();
    const result = lookupBarcode(products, barcode);

    StorageService.logBarcodeScan({
      productId: result.product?.id,
      barcodeHash: undefined,
      source,
      context: 'STOCK_IN',
      result: !result.valid ? 'INVALID' : result.found ? 'MATCHED' : result.archived ? 'DUPLICATE' : 'NOT_FOUND',
      latencyMs: Date.now() - started,
      performedBy: StorageService.getUserId() || undefined,
    });

    if (!result.valid) {
      setStatusMsg({ kind: 'err', text: 'Barcode format/value valid nahi hai.' });
      return 'rejected' as const;
    }
    if (result.archived) {
      const p = lookupBarcode(products, barcode, { includeArchived: true }).product;
      setArchivedHit(p);
      setStatusMsg({ kind: 'warn', text: 'Ye product archived hai. Restore karke use karein.' });
      return 'rejected' as const;
    }
    if (!result.found || !result.product) {
      setNotFound(barcode);
      setStatusMsg({ kind: 'warn', text: 'Barcode linked nahi hai. Done dabakar naya product bana sakte hain.' });
      return 'unlinked' as const;
    }

    const p = result.product;
    pushLine(
      {
        productId: p.id,
        barcode: p.barcode,
        name: p.name,
        quantity: 1,
        unitCost: p.purchasePrice,
        currentStock: Number(p.stock || 0),
        unit: p.unit || 'pcs',
      },
      `${p.name} · 1 ${p.unit || 'pcs'} added`
    );
    setLastScan(p.barcode || barcode);
    return 'added' as const;
  };

  const updateLine = (productId: string, patch: Partial<DraftLine>) => {
    setLines(prev => prev.map(l => (l.productId === productId ? { ...l, ...patch } : l)));
  };

  const removeLine = (productId: string) => {
    setLines(prev => prev.filter(l => l.productId !== productId));
  };

  const createProductFromScan = () => {
    if (!newProduct) return;
    const name = newProduct.name.trim();
    const price = Number(newProduct.price);
    if (!name || !Number.isFinite(price)) {
      setStatusMsg({ kind: 'err', text: 'Product name aur selling price zaroori hai.' });
      return;
    }

    const existing = StorageService.isBarcodeTaken(newProduct.barcode);
    if (existing) {
      setStatusMsg({ kind: 'err', text: `Ye barcode pehle se ${existing.name} ke saath linked hai.` });
      return;
    }

    const id = crypto.randomUUID();
    const qty = Number(newProduct.quantity) || 0;
    const product: Product = {
      id,
      name,
      price,
      stock: 0,
      category: newProduct.category.trim() || 'General',
      purchasePrice: newProduct.purchasePrice ? Number(newProduct.purchasePrice) : undefined,
      gstRate: newProduct.gstRate ? Number(newProduct.gstRate) : undefined,
      hsn: newProduct.hsn.trim() || undefined,
      unit: newProduct.unit.trim() || 'pcs',
      lowStockThreshold: newProduct.lowStockThreshold ? Number(newProduct.lowStockThreshold) : undefined,
      barcode: newProduct.barcode,
      barcodeEnabled: true,
    };

    StorageService.saveProduct(product);

    // Opening quantity is recorded as OPENING_STOCK so the ledger explains the first units.
    if (qty > 0) {
      const res = StorageService.applyStockMovement({
        productId: id,
        movementType: 'OPENING_STOCK',
        quantityDelta: qty,
        stockBefore: 0,
        barcodeSnapshot: product.barcode,
        referenceType: 'ADJUSTMENT',
        reason: 'Opening stock at product creation',
      });
      if (!res.ok) {
        setStatusMsg({ kind: 'err', text: res.error || 'Opening stock save nahi hua.' });
        return;
      }
    }

    const fresh = StorageService.getProducts().find(p => p.id === id) || product;
    pushLine(
      {
        productId: id,
        barcode: fresh.barcode,
        name: fresh.name,
        quantity: 0,
        unitCost: fresh.purchasePrice,
        currentStock: Number(fresh.stock || 0),
        unit: fresh.unit || 'pcs',
      },
      `${fresh.name} create hua (opening stock ${fresh.stock}).`
    );

    setNewProduct(null);
    setNotFound(null);
    setLastScan(fresh.barcode || '');
  };

  const finish = () => {
    if (lines.length === 0) return false;
    const entryId = crypto.randomUUID();
    const now = new Date().toISOString();

    const items: StockEntryItem[] = lines
      .filter(l => Number(l.quantity) > 0)
      .map(l => ({
        id: crypto.randomUUID(),
        productId: l.productId,
        barcodeSnapshot: l.barcode,
        productNameSnapshot: l.name,
        quantity: Number(l.quantity),
        unitCost: l.unitCost,
        lineTotal: Number(l.quantity) * (Number(l.unitCost) || 0),
        createdAt: now,
      }));

    if (items.length === 0) {
      setStatusMsg({ kind: 'err', text: 'Har line me quantity 0 se zyada honi chahiye.' });
      return false;
    }

    const res = StorageService.saveStockEntry({
      id: entryId,
      entryDate: new Date().toISOString().split('T')[0],
      supplierNameSnapshot: supplier.trim() || undefined,
      supplierInvoiceNumber: supplierInvoice.trim() || undefined,
      status: 'DRAFT',
      note: note.trim() || undefined,
      createdBy: StorageService.getUserId() || undefined,
      createdAt: now,
      items,
    });

    if (!res.ok || !res.entry) {
      setStatusMsg({ kind: 'err', text: res.error || 'Stock entry save nahi hui.' });
      return false;
    }

    HapticService.success?.();
    setSavedEntry(res.entry);
    setLines([]);
    setStatusMsg(null);
    return true;
  };

  const restoreArchived = () => {
    if (!archivedHit) return;
    const restored: Product = { ...archivedHit, isArchived: false, updatedAt: new Date().toISOString() };
    StorageService.saveProduct(restored);
    setArchivedHit(null);
    setStatusMsg({ kind: 'ok', text: `${restored.name} restore ho gaya. Ab dobara scan karein.` });
  };

  // ---------------------------------------------------------------- summary
  if (savedEntry) {
    return (
      <div className="min-h-[100dvh] bg-surface-container-low pb-32">
        <div className="pt-safe pb-6 px-6 bg-surface-container-low sticky top-0 z-30">
          <div className="max-w-3xl mx-auto">
            <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground font-black text-xs uppercase tracking-widest mb-4">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h1 className="text-3xl font-black font-heading text-foreground">Stock In Complete</h1>
          </div>
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto px-6 space-y-6">
          <div className="bg-surface rounded-[32px] border border-border p-8 space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-google-green/10 flex items-center justify-center text-google-green">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Entry number</p>
                <p className="text-xl font-black font-heading text-foreground font-mono">{savedEntry.entryNumber}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-surface-container-high rounded-2xl p-4">
                <Layers className="w-5 h-5 text-google-blue mb-2" />
                <p className="text-2xl font-black font-heading text-foreground">{savedEntry.totalItems}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">SKUs</p>
              </div>
              <div className="bg-surface-container-high rounded-2xl p-4">
                <Boxes className="w-5 h-5 text-google-blue mb-2" />
                <p className="text-2xl font-black font-heading text-foreground">{savedEntry.totalQuantity}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Units</p>
              </div>
              <div className="bg-surface-container-high rounded-2xl p-4">
                <IndianRupee className="w-5 h-5 text-google-blue mb-2" />
                <p className="text-2xl font-black font-heading text-foreground">{Math.round(savedEntry.totalValue)}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Value</p>
              </div>
            </div>

            <div className="space-y-2">
              {savedEntry.items.map(i => (
                <div key={i.id} className="flex items-center justify-between bg-surface-container-high/60 rounded-2xl px-4 py-3">
                  <div>
                    <p className="font-bold text-foreground">{i.productNameSnapshot}</p>
                    <p className="text-[11px] font-mono text-muted-foreground">{i.barcodeSnapshot || '—'}</p>
                  </div>
                  <span className="font-black text-google-green">+{i.quantity}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setSavedEntry(null)}
              className="flex-1 py-5 rounded-full bg-primary text-white font-black text-sm uppercase tracking-widest"
            >
              Aur stock add karein
            </button>
            <button
              onClick={onBack}
              className="flex-1 py-5 rounded-full bg-surface-container-high font-black text-sm uppercase tracking-widest"
            >
              Inventory par jayein
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ---------------------------------------------------------------- session
  return (
    <div className="min-h-[100dvh] bg-surface-container-low pb-32">
      <div className="pt-safe pb-6 px-6 bg-surface-container-low sticky top-0 z-30">
        <div className="max-w-3xl mx-auto flex items-start justify-between gap-4">
          <div>
            <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground font-black text-xs uppercase tracking-widest mb-3">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <span className="text-[11px] font-black text-google-blue uppercase tracking-[0.3em] block mb-1">Inventory</span>
            <h1 className="text-3xl font-black font-heading text-foreground leading-none">Stock In</h1>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black font-heading text-foreground">{lines.length}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Lines</p>
          </div>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto px-6 space-y-6">
        <div className="bg-surface rounded-[28px] border border-border p-6">
          <BarcodeScanField
            label="Scan barcode — pehla aur main action"
            autoFocus
            onScan={handleScan}
            continuous
            cameraFeedback={statusMsg}
            scanDraft={{
              title: 'Stock entry',
              lines: lines.map(line => ({ id: line.productId, name: line.name, quantity: Number(line.quantity), amount: line.unitCost == null ? undefined : line.quantity * line.unitCost })),
              total: totalValue,
              totalLabel: 'Stock entry value',
            }}
            finalize={{ label: 'Save stock', run: finish }}
            hint="Ek hi session me jitne products chahiye scan karte jayein."
            lastScanMessage={lastScan ? `Last scan: ${lastScan}` : undefined}
          />

          <AnimatePresence>
            {statusMsg && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`mt-4 rounded-2xl px-4 py-3 text-sm font-bold ${
                  statusMsg.kind === 'ok'
                    ? 'bg-google-green/10 text-google-green'
                    : statusMsg.kind === 'warn'
                    ? 'bg-amber-500/10 text-amber-700'
                    : 'bg-google-red/10 text-google-red'
                }`}
              >
                {statusMsg.text}
              </motion.div>
            )}
          </AnimatePresence>

          {archivedHit && (
            <button
              onClick={restoreArchived}
              className="mt-3 w-full py-4 rounded-full bg-surface-container-high font-black text-xs uppercase tracking-widest"
            >
              {archivedHit.name} restore karein
            </button>
          )}

          {notFound && !newProduct && (
            <div className="mt-4 rounded-2xl border-2 border-dashed border-border p-5 space-y-3">
              <p className="text-sm font-bold text-foreground">
                Barcode <span className="font-mono">{notFound}</span> kisi product se linked nahi hai.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setNewProduct(emptyNewProduct(notFound))}
                  className="flex-1 py-4 rounded-full bg-primary text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Create New Product
                </button>
                <button
                  onClick={() => setNotFound(null)}
                  className="px-6 py-4 rounded-full bg-surface-container-high font-black text-xs uppercase tracking-widest"
                >
                  Skip
                </button>
              </div>
            </div>
          )}
        </div>

        {newProduct && (
          <div className="bg-surface rounded-[28px] border-2 border-google-blue/30 p-6 space-y-4">
            <h3 className="text-xl font-black font-heading text-foreground">Naya product banayein</h3>
            <p className="text-[11px] font-bold text-muted-foreground">
              Barcode lock hai. Jo detail nahi pata wo blank chhod dein — system fake value nahi bharega.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Barcode (locked)</label>
                <input
                  value={newProduct.barcode}
                  readOnly
                  className="w-full p-3.5 rounded-2xl bg-surface-container-highest font-mono font-bold text-muted-foreground mt-1"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Product name *</label>
                <input
                  autoFocus
                  value={newProduct.name}
                  onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
                  className="w-full p-3.5 rounded-2xl bg-surface-container-high font-bold text-foreground mt-1 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Selling price *</label>
                <input
                  type="number"
                  value={newProduct.price}
                  onChange={e => setNewProduct({ ...newProduct, price: e.target.value })}
                  className="w-full p-3.5 rounded-2xl bg-surface-container-high font-bold text-foreground mt-1 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Opening quantity</label>
                <input
                  type="number"
                  value={newProduct.quantity}
                  onChange={e => setNewProduct({ ...newProduct, quantity: e.target.value })}
                  className="w-full p-3.5 rounded-2xl bg-surface-container-high font-bold text-foreground mt-1 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Purchase price</label>
                <input
                  type="number"
                  value={newProduct.purchasePrice}
                  onChange={e => setNewProduct({ ...newProduct, purchasePrice: e.target.value })}
                  className="w-full p-3.5 rounded-2xl bg-surface-container-high font-bold text-foreground mt-1 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Category</label>
                <input
                  value={newProduct.category}
                  onChange={e => setNewProduct({ ...newProduct, category: e.target.value })}
                  className="w-full p-3.5 rounded-2xl bg-surface-container-high font-bold text-foreground mt-1 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Unit</label>
                <input
                  value={newProduct.unit}
                  onChange={e => setNewProduct({ ...newProduct, unit: e.target.value })}
                  className="w-full p-3.5 rounded-2xl bg-surface-container-high font-bold text-foreground mt-1 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">GST %</label>
                <input
                  type="number"
                  value={newProduct.gstRate}
                  onChange={e => setNewProduct({ ...newProduct, gstRate: e.target.value })}
                  className="w-full p-3.5 rounded-2xl bg-surface-container-high font-bold text-foreground mt-1 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">HSN/SAC</label>
                <input
                  value={newProduct.hsn}
                  onChange={e => setNewProduct({ ...newProduct, hsn: e.target.value })}
                  className="w-full p-3.5 rounded-2xl bg-surface-container-high font-bold text-foreground mt-1 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Low stock alert</label>
                <input
                  type="number"
                  value={newProduct.lowStockThreshold}
                  onChange={e => setNewProduct({ ...newProduct, lowStockThreshold: e.target.value })}
                  className="w-full p-3.5 rounded-2xl bg-surface-container-high font-bold text-foreground mt-1 outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={createProductFromScan}
                className="flex-1 py-4 rounded-full bg-primary text-white font-black text-xs uppercase tracking-widest"
              >
                Save &amp; continue scanning
              </button>
              <button
                onClick={() => setNewProduct(null)}
                className="px-6 py-4 rounded-full bg-surface-container-high font-black text-xs uppercase tracking-widest"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Session lines */}
        <div className="bg-surface rounded-[28px] border border-border p-6 space-y-3">
          <h3 className="text-lg font-black font-heading text-foreground">Scanned items</h3>
          {lines.length === 0 ? (
            <div className="text-center py-10">
              <Package className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-bold text-muted-foreground">Abhi koi scan nahi hua</p>
            </div>
          ) : (
            lines.map(l => (
              <div key={l.productId} className="flex items-center gap-3 bg-surface-container-high/60 rounded-2xl p-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground truncate">{l.name}</p>
                  <p className="text-[11px] font-mono text-muted-foreground truncate">
                    {l.barcode || '—'} · current {l.currentStock} {l.unit}
                  </p>
                </div>
                <input
                  type="number"
                  min={0}
                  value={l.quantity}
                  onChange={e => updateLine(l.productId, { quantity: Number(e.target.value) })}
                  className="w-20 p-2.5 rounded-xl bg-surface font-black text-center text-foreground outline-none"
                />
                <input
                  type="number"
                  min={0}
                  placeholder="cost"
                  value={l.unitCost ?? ''}
                  onChange={e => updateLine(l.productId, { unitCost: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-24 p-2.5 rounded-xl bg-surface font-bold text-center text-foreground outline-none"
                />
                <button
                  onClick={() => removeLine(l.productId)}
                  className="w-9 h-9 rounded-full bg-google-red/10 text-google-red flex items-center justify-center shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Header details */}
        {lines.length > 0 && (
          <div className="bg-surface rounded-[28px] border border-border p-6 space-y-4">
            <h3 className="text-lg font-black font-heading text-foreground">Purchase details (optional)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                placeholder="Supplier name"
                value={supplier}
                onChange={e => setSupplier(e.target.value)}
                className="w-full p-3.5 rounded-2xl bg-surface-container-high font-bold text-foreground outline-none"
              />
              <input
                placeholder="Supplier invoice number"
                value={supplierInvoice}
                onChange={e => setSupplierInvoice(e.target.value)}
                className="w-full p-3.5 rounded-2xl bg-surface-container-high font-bold text-foreground outline-none"
              />
            </div>
            <textarea
              placeholder="Note"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              className="w-full p-3.5 rounded-2xl bg-surface-container-high font-bold text-foreground outline-none resize-none"
            />

            <div className="flex items-center justify-between pt-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total</p>
                <p className="text-xl font-black font-heading text-foreground">
                  {totalUnits} units · ₹{Math.round(totalValue).toLocaleString('en-IN')}
                </p>
              </div>
              <button
                onClick={finish}
                className="px-8 py-5 rounded-full bg-primary text-white font-black text-sm uppercase tracking-widest shadow-google"
              >
                Finish Stock In
              </button>
            </div>
          </div>
        )}

        {lines.length > 0 && totalValue === 0 && (
          <p className="text-[11px] font-bold text-amber-600 flex items-center gap-2 px-2">
            <AlertTriangle className="w-4 h-4" />
            Purchase cost blank hai — total value 0 dikhegi. Ledger me quantity phir bhi record hogi.
          </p>
        )}
      </motion.div>
    </div>
  );
};

export default StockIn;
