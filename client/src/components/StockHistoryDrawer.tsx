import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Copy,
  Check,
  History,
  SlidersHorizontal,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { Product } from '../types';
import { StorageService } from '../services/storageService';
import { movementLabel, adjustmentToMovement } from '../services/stockService';
import { stockStateOf, lowStockThresholdFor } from '../services/barcodeService';
import { HapticService } from '../services/hapticService';

interface StockHistoryDrawerProps {
  product: Product | null;
  onClose: () => void;
  onChanged: () => void;
}

type AdjustKind = 'INCREASE' | 'DECREASE' | 'DAMAGE' | 'RETURN' | 'CORRECTION';

const KIND_LABELS: Record<AdjustKind, string> = {
  INCREASE: 'Increase',
  DECREASE: 'Decrease',
  DAMAGE: 'Damage',
  RETURN: 'Return',
  CORRECTION: 'Correction (set exact)',
};

/**
 * Product drawer: barcode, stock history from the immutable ledger, and manual
 * stock adjustment. Also surfaces ledger drift so a bad write cannot hide.
 */
const StockHistoryDrawer: React.FC<StockHistoryDrawerProps> = ({ product, onClose, onChanged }) => {
  const [copied, setCopied] = useState(false);
  const [kind, setKind] = useState<AdjustKind>('INCREASE');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [tab, setTab] = useState<'HISTORY' | 'ADJUST'>('HISTORY');

  const movements = useMemo(
    () => (product ? StorageService.getStockHistory(product.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [product, msg]
  );

  const ledgerStock = useMemo(
    () => (product ? StorageService.getLedgerStock(product.id) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [product, msg]
  );

  if (!product) return null;

  const state = stockStateOf(product);
  const drift = Number(product.stock || 0) - ledgerStock;
  const threshold = lowStockThresholdFor(product);

  const previewDelta =
    kind === 'CORRECTION'
      ? (Number(quantity) || 0) - Number(product.stock || 0)
      : adjustmentToMovement(kind, Number(quantity) || 0).delta;

  const copyBarcode = async () => {
    if (!product.barcode) return;
    try {
      await navigator.clipboard.writeText(product.barcode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const applyAdjustment = () => {
    const qty = Number(quantity);
    if (!reason.trim()) {
      setMsg({ kind: 'err', text: 'Reason likhna zaroori hai.' });
      return;
    }
    if (!Number.isFinite(qty) || qty === 0) {
      setMsg({ kind: 'err', text: 'Quantity valid nahi hai.' });
      return;
    }

    const { movementType, delta } = adjustmentToMovement(kind, qty);
    const res = StorageService.applyStockMovement({
      productId: product.id,
      movementType,
      quantityDelta: delta,
      stockBefore: Number(product.stock || 0),
      barcodeSnapshot: product.barcode,
      referenceType: 'ADJUSTMENT',
      reason: reason.trim(),
      performedBy: StorageService.getUserId() || undefined,
    });

    if (!res.ok) {
      setMsg({ kind: 'err', text: res.error || 'Adjustment fail ho gaya.' });
      return;
    }

    HapticService.success?.();
    setMsg({ kind: 'ok', text: `Stock ${delta > 0 ? '+' : ''}${delta} update ho gaya.` });
    setQuantity('');
    setReason('');
    onChanged();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex justify-end">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div
          initial={{ x: 80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 80, opacity: 0 }}
          className="relative w-full sm:max-w-lg h-full bg-surface border-l border-border overflow-y-auto pb-24"
        >
          <div className="sticky top-0 bg-surface/95 backdrop-blur px-6 py-5 border-b border-border flex items-start justify-between gap-4 z-10">
            <div className="min-w-0">
              <h2 className="text-2xl font-black font-heading text-foreground truncate">{product.name}</h2>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                {product.category}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Barcode */}
            <div className="bg-surface-container-high rounded-[24px] p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">Barcode</p>
              {product.barcode ? (
                <div className="flex items-center gap-3">
                  <span className="font-mono font-black text-foreground break-all flex-1">{product.barcode}</span>
                  <button
                    onClick={copyBarcode}
                    className="w-10 h-10 rounded-full bg-surface flex items-center justify-center shrink-0"
                    aria-label="Copy barcode"
                  >
                    {copied ? <Check className="w-4 h-4 text-google-green" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              ) : (
                <p className="text-sm font-bold text-muted-foreground">
                  Koi barcode nahi. Edit karke barcode add karein.
                </p>
              )}
              {product.barcodeFormat && (
                <p className="text-[11px] font-bold text-muted-foreground mt-2">Format: {product.barcodeFormat}</p>
              )}
            </div>

            {/* Stock snapshot */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-container-high rounded-[24px] p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Current stock</p>
                <p className="text-3xl font-black font-heading text-foreground">
                  {product.stock} <span className="text-sm">{product.unit || 'pcs'}</span>
                </p>
                <p
                  className={`text-[10px] font-black uppercase tracking-widest mt-1 ${
                    state === 'OUT_OF_STOCK'
                      ? 'text-google-red'
                      : state === 'LOW_STOCK'
                      ? 'text-amber-600'
                      : 'text-google-green'
                  }`}
                >
                  {state === 'OUT_OF_STOCK' ? 'Out of stock' : state === 'LOW_STOCK' ? 'Low stock' : 'In stock'}
                </p>
              </div>
              <div className="bg-surface-container-high rounded-[24px] p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Ledger stock</p>
                <p className="text-3xl font-black font-heading text-foreground">{ledgerStock}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                  Alert level {threshold}
                </p>
              </div>
            </div>

            {drift !== 0 && (
              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm font-bold text-amber-700">
                  Ledger se {Math.abs(drift)} {product.unit || 'pcs'} ka farak hai. Reconciliation chalayein.
                </p>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 bg-surface-container-high rounded-full p-1">
              {(['HISTORY', 'ADJUST'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-3 rounded-full font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 ${
                    tab === t ? 'bg-primary text-white' : 'text-muted-foreground'
                  }`}
                >
                  {t === 'HISTORY' ? <History className="w-4 h-4" /> : <SlidersHorizontal className="w-4 h-4" />}
                  {t === 'HISTORY' ? 'History' : 'Adjust'}
                </button>
              ))}
            </div>

            {msg && (
              <div
                className={`rounded-2xl px-4 py-3 text-sm font-bold ${
                  msg.kind === 'ok' ? 'bg-google-green/10 text-google-green' : 'bg-google-red/10 text-google-red'
                }`}
              >
                {msg.text}
              </div>
            )}

            {tab === 'HISTORY' ? (
              <div className="space-y-2">
                {movements.length === 0 ? (
                  <p className="text-sm font-bold text-muted-foreground text-center py-8">
                    Abhi koi stock movement record nahi hua.
                  </p>
                ) : (
                  movements.map(m => (
                    <div key={m.id} className="bg-surface-container-high/60 rounded-2xl p-4 flex items-start gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          m.quantityDelta >= 0 ? 'bg-google-green/10 text-google-green' : 'bg-google-red/10 text-google-red'
                        }`}
                      >
                        {m.quantityDelta >= 0 ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground text-sm">{movementLabel(m.movementType)}</p>
                        <p className="text-[11px] font-mono text-muted-foreground">
                          {m.stockBefore} → {m.stockAfter} ({m.quantityDelta > 0 ? '+' : ''}
                          {m.quantityDelta})
                        </p>
                        {m.reason && <p className="text-[11px] text-muted-foreground mt-1">{m.reason}</p>}
                        <p className="text-[10px] font-bold text-muted-foreground mt-1">
                          {new Date(m.createdAt).toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">
                    Adjustment type
                  </label>
                  <select
                    value={kind}
                    onChange={e => setKind(e.target.value as AdjustKind)}
                    className="w-full mt-1 p-3.5 rounded-2xl bg-surface-container-high font-bold text-foreground outline-none"
                  >
                    {(Object.keys(KIND_LABELS) as AdjustKind[]).map(k => (
                      <option key={k} value={k}>
                        {KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">
                    {kind === 'CORRECTION' ? 'New stock value' : 'Quantity'}
                  </label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    className="w-full mt-1 p-3.5 rounded-2xl bg-surface-container-high font-bold text-foreground outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">
                    Reason (zaroori)
                  </label>
                  <input
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="e.g. Physical count mismatch, damaged in transit"
                    className="w-full mt-1 p-3.5 rounded-2xl bg-surface-container-high font-bold text-foreground outline-none"
                  />
                </div>

                <div className="rounded-2xl bg-surface-container-high p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">Preview</p>
                  <p className="font-black text-foreground">
                    {product.stock} → {Number(product.stock || 0) + previewDelta}{' '}
                    <span className={previewDelta >= 0 ? 'text-google-green' : 'text-google-red'}>
                      ({previewDelta > 0 ? '+' : ''}
                      {previewDelta})
                    </span>
                  </p>
                </div>

                <button
                  onClick={applyAdjustment}
                  className="w-full py-5 rounded-full bg-primary text-white font-black text-sm uppercase tracking-widest"
                >
                  Save adjustment
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default StockHistoryDrawer;
