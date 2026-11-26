import React, { useEffect, useMemo, useState } from 'react';
import { Product } from '../types';
import { StorageService } from '../services/storageService';
import {
  Plus,
  Search,
  Package,
  Trash2,
  Edit2,
  ScanLine,
  Copy,
  Check,
  History,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import BarcodeScanField from './BarcodeScanField';
import StockHistoryDrawer from './StockHistoryDrawer';
import { detectBarcodeFormat, isBarcodeStructurallyValid, normalizeBarcode, stockStateOf } from '../services/barcodeService';
import { HapticService } from '../services/hapticService';
import { WorkspaceFilters, WorkspaceHeading, WorkspaceMetrics, workspace, workspaceMoney } from './WorkspaceUI';

interface InventoryProps {
  onBack?: () => void;
  /** Opens the scan-first Stock In session owned by the parent shell. */
  onOpenStockIn?: () => void;
  onOpenBarcodeLabels?: () => void;
}

interface ProductDraft extends Partial<Product> {
  openingStock?: number;
}

const emptyDraft = (): ProductDraft => ({
  name: '',
  price: 0,
  stock: 0,
  openingStock: 0,
  category: 'General',
  unit: 'pcs',
  barcodeEnabled: true,
});

const Inventory: React.FC<InventoryProps> = ({ onOpenStockIn, onOpenBarcodeLabels, onBack }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'unlinked'>('all');
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft());
  const [originalId, setOriginalId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerProduct, setDrawerProduct] = useState<Product | null>(null);
  const [savingItem, setSavingItem] = useState(false);
  const [formMsg, setFormMsg] = useState<{ kind: 'ok' | 'err' | 'warn'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refresh = () => setProducts(StorageService.getProducts());

  useEffect(() => {
    refresh();
  }, []);

  const visibleProducts = useMemo(
    () => products.filter(p => !p.isArchived),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const matchingCategory = categoryFilter
      ? visibleProducts.filter(product => (product.category?.trim() || 'General') === categoryFilter)
      : visibleProducts;
    const matchingStock = matchingCategory.filter(product => stockFilter === 'all' || (stockFilter === 'low' ? product.category?.toLowerCase() !== 'services' && stockStateOf(product) !== 'IN_STOCK' : !product.barcode || product.barcodeEnabled === false));
    if (!q) return matchingStock;
    // Search matches name, category OR barcode (PRD §14).
    return matchingStock.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q)
    );
  }, [visibleProducts, searchTerm, categoryFilter, stockFilter]);
  const categories = [...new Set(visibleProducts.map(product => product.category?.trim() || 'General'))]
    .sort((a, b) => a.localeCompare(b));

  const totalStockValue = useMemo(
    () => visibleProducts.reduce((acc, p) => acc + (Number(p.price) || 0) * (Number(p.stock) || 0), 0),
    [visibleProducts]
  );
  const lowStockCount = useMemo(
    () => visibleProducts.filter(p => p.category?.toLowerCase() !== 'services' && stockStateOf(p) !== 'IN_STOCK').length,
    [visibleProducts]
  );

  const openCreate = () => {
    setDraft(emptyDraft());
    setOriginalId(null);
    setFormMsg(null);
    setIsAdding(true);
  };

  const handleEdit = (product: Product) => {
    setDraft({ ...product });
    setOriginalId(product.id);
    setFormMsg(null);
    setIsAdding(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingItem) return;
    const name = (draft.name || '').trim();
    const price = Number(draft.price);
    if (!name) {
      setFormMsg({ kind: 'err', text: 'Product name zaroori hai.' });
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setFormMsg({ kind: 'err', text: 'Selling price valid nahi hai.' });
      return;
    }

    const finalId = draft.id?.trim() || originalId || crypto.randomUUID();
    const barcode = draft.barcode ? normalizeBarcode(draft.barcode) : '';

    // Duplicate barcode protection (PRD §9): one barcode per product per business.
    if (barcode) {
      if (!isBarcodeStructurallyValid(barcode)) {
        setFormMsg({ kind: 'err', text: 'Barcode format/value valid nahi hai.' });
        return;
      }
      const clash = StorageService.isBarcodeTaken(barcode, originalId || undefined);
      if (clash) {
        setFormMsg({ kind: 'err', text: `Ye barcode pehle se ${clash.name} ke saath linked hai.` });
        return;
      }
    }

    const isNew = !originalId;
    const openingStock = Number(draft.openingStock) || 0;

    const existing = originalId ? StorageService.getProducts().find(item => item.id === originalId) : undefined;
    const product: Product = {
      ...existing,
      id: finalId,
      name,
      price,
      stock: isNew ? 0 : Number(existing?.stock ?? draft.stock) || 0, // stock is ledger-driven after creation
      category: (draft.category || 'General').trim() || 'General',
      purchasePrice: draft.purchasePrice !== undefined && draft.purchasePrice !== null && draft.purchasePrice !== ('' as unknown as number)
        ? Number(draft.purchasePrice)
        : undefined,
      gstRate: draft.gstRate !== undefined && draft.gstRate !== null && draft.gstRate !== ('' as unknown as number)
        ? Number(draft.gstRate)
        : undefined,
      hsn: draft.hsn?.trim() || undefined,
      unit: draft.unit?.trim() || 'pcs',
      secondaryUnit: draft.secondaryUnit?.trim() || undefined,
      conversionRate: draft.conversionRate ? Number(draft.conversionRate) : undefined,
      mrp: draft.mrp ? Number(draft.mrp) : undefined,
      wholesalePrice: draft.wholesalePrice ? Number(draft.wholesalePrice) : undefined,
      batches: draft.batches && draft.batches.length > 0 ? draft.batches : undefined,
      showInOnlineStore: draft.showInOnlineStore !== false,
      lowStockThreshold:
        draft.lowStockThreshold !== undefined && draft.lowStockThreshold !== null
          ? Number(draft.lowStockThreshold)
          : undefined,
      barcode: barcode || undefined,
      barcodeFormat: barcode ? detectBarcodeFormat(barcode) : undefined,
      barcodeEnabled: draft.barcodeEnabled !== false,
    };

    setSavingItem(true);
    setFormMsg(null);
    try {
      await StorageService.saveProductConfirmed(product);
    } catch (error) {
      setFormMsg({ kind: 'err', text: error instanceof Error ? error.message : 'Item save failed. Try again.' });
      return;
    } finally {
      setSavingItem(false);
    }

    // Opening stock goes through the ledger, never a silent field write.
    if (isNew && openingStock > 0) {
      const res = StorageService.applyStockMovement({
        productId: finalId,
        movementType: 'OPENING_STOCK',
        quantityDelta: openingStock,
        stockBefore: 0,
        barcodeSnapshot: product.barcode,
        referenceType: 'ADJUSTMENT',
        reason: 'Opening stock at product creation',
      });
      if (!res.ok) {
        setFormMsg({ kind: 'err', text: res.error || 'Opening stock save nahi hua.' });
        return;
      }
    }

    HapticService.success?.();
    refresh();
    setIsAdding(false);
    setDraft(emptyDraft());
    setOriginalId(null);
    setFormMsg(null);
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredProducts.map(p => p.id)));
  };

  /** Archive (not delete) anything referenced by an invoice, so old bills keep resolving. */
  const removeProducts = (ids: string[]) => {
    if (!window.confirm(`${ids.length} item hataane hain? Invoice me use hue items archive honge.`)) return;
    const invoiceProductIds = new Set<string>();
    StorageService.getInvoices().forEach(inv => inv.items.forEach(i => invoiceProductIds.add(i.productId)));

    ids.forEach(id => {
      if (invoiceProductIds.has(id)) StorageService.archiveProduct(id);
      else StorageService.deleteProduct(id);
    });

    refresh();
    setSelectedIds(new Set());
  };

  const copyBarcode = async (product: Product) => {
    if (!product.barcode) return;
    try {
      await navigator.clipboard.writeText(product.barcode);
      setCopiedId(product.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setCopiedId(null);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-surface-container-low">
      <div className={workspace.page}>
        <WorkspaceHeading title="Inventory" onBack={onBack} actions={<>
          {onOpenBarcodeLabels && <button type="button" onClick={onOpenBarcodeLabels} className={workspace.secondary}><ScanLine size={16} /> Labels</button>}
          {onOpenStockIn && <button type="button" onClick={onOpenStockIn} className={workspace.secondary}>Stock in</button>}
          <button type="button" onClick={openCreate} className={workspace.primary}><Plus size={16} /> Add item</button>
        </>} />
        <WorkspaceMetrics values={[
          { label: 'Items', value: visibleProducts.length },
          { label: 'Stock at selling price', value: workspaceMoney(totalStockValue) },
          { label: 'Active barcodes', value: visibleProducts.filter(product => product.barcode && product.barcodeEnabled !== false).length },
          { label: 'Low or out of stock', value: lowStockCount, tone: lowStockCount ? 'attention' : undefined },
        ]} />
        <div className="flex flex-wrap gap-2">
          <label className="relative min-w-[150px] flex-1">
            <Search aria-hidden="true" size={17} className="pointer-events-none absolute left-3 top-3.5 text-muted-foreground" />
            <input type="search" aria-label="Search inventory" placeholder="Item, category or barcode" value={searchTerm} onChange={event => { setSearchTerm(event.target.value); setSelectedIds(new Set()); }} className={workspace.input + ' pl-9'} />
          </label>
          <select aria-label="Item category" value={categoryFilter} onChange={event => { setCategoryFilter(event.target.value); setSelectedIds(new Set()); }} className={workspace.input + ' w-auto max-w-full'}>
            <option value="">All item categories</option>
            {categoryFilter && !categories.includes(categoryFilter) && <option value={categoryFilter}>{categoryFilter}</option>}
            {categories.map(category => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <WorkspaceFilters label="Stock status" value={stockFilter} onChange={value => { setStockFilter(value); setSelectedIds(new Set()); }} options={[
            { id: 'all', label: 'All items' }, { id: 'low', label: 'Low stock' }, { id: 'unlinked', label: 'No active barcode' },
          ]} />
          <div className="flex flex-wrap gap-2">
            {filteredProducts.length > 0 && <button type="button" onClick={handleSelectAll} className={workspace.secondary}>{selectedIds.size === filteredProducts.length ? 'Deselect all' : 'Select all'}</button>}
            {selectedIds.size > 0 && <button type="button" onClick={() => removeProducts([...selectedIds])} className={workspace.secondary + ' text-red-700 dark:text-red-300'}><Trash2 size={16} /> Remove ({selectedIds.size})</button>}
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filteredProducts.map(product => {
              const state = stockStateOf(product);
              return (
                <motion.div
                  key={product.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={`bg-surface border p-3 sm:p-4 rounded-2xl transition-all group relative overflow-hidden ${
                    selectedIds.has(product.id)
                      ? 'border-google-blue ring-2 ring-google-blue/20 bg-google-blue/5'
                      : 'border-border hover:border-google-blue/20'
                  }`}
                >
                  <div className="absolute top-4 left-4 z-10">
                    <button
                      aria-label="Select"
                      onClick={() => toggleSelection(product.id)}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        selectedIds.has(product.id)
                          ? 'bg-google-blue border-google-blue'
                          : 'border-muted-foreground/30 bg-surface group-hover:border-google-blue/50'
                      }`}
                    >
                      {selectedIds.has(product.id) && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                    </button>
                  </div>

                  <div className="flex justify-between items-start mb-4 relative pl-8">
                    <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-google-blue">
                      <Package className="w-7 h-7" />
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setDrawerProduct(product)}
                        className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-google-blue hover:bg-google-blue/5 rounded-full"
                        aria-label="Stock history"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(product)}
                        className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-google-blue hover:bg-google-blue/5 rounded-full"
                        aria-label="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <h3 className="mb-1 font-heading text-base font-semibold text-foreground">
                      <button type="button" onClick={() => setDrawerProduct(product)} className="block max-w-full truncate text-left hover:underline">{product.name}</button>
                    </h3>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">{product.category}</p>
                  </div>

                  {/* Barcode row */}
                  <div className="mt-4 flex items-center gap-2">
                    {product.barcode ? (
                      <>
                        <span className="flex-1 font-mono text-[11px] font-bold text-muted-foreground truncate">
                          {product.barcode}
                        </span>
                        <button
                          onClick={() => copyBarcode(product)}
                          aria-label="Copy barcode"
                          className="w-7 h-7 rounded-full bg-surface-container-high flex items-center justify-center shrink-0"
                        >
                          {copiedId === product.id ? (
                            <Check className="w-3.5 h-3.5 text-google-green" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </button>
                      </>
                    ) : (
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">
                        No barcode
                      </span>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-border flex items-end justify-between">
                    <div>
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Unit Price</p>
                      <p className="text-2xl font-black text-google-blue tracking-tighter">
                        ₹{Number(product.price).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-2">Stock</p>
                      <span
                        className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter text-white ${
                          state === 'OUT_OF_STOCK'
                            ? 'bg-google-red animate-pulse'
                            : state === 'LOW_STOCK'
                            ? 'bg-amber-500'
                            : 'bg-google-green'
                        }`}
                      >
                        {product.stock} {product.unit || 'units'}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {filteredProducts.length === 0 && <div role="status" className={workspace.panel + ' p-10 text-center text-sm text-muted-foreground'}>
          {visibleProducts.length ? 'No items match these filters.' : 'Add an item or scan stock to get started.'}
        </div>}
      </div>

      {/* Product modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!savingItem) setIsAdding(false); }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: 50, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 50, opacity: 0, scale: 0.95 }}
              className="relative bg-surface w-full max-w-2xl rounded-[40px] overflow-hidden shadow-google-lg border border-border my-8"
            >
              <div className="p-8 pb-4 flex justify-between items-start">
                <div>
                  <h2 className="text-3xl font-black font-heading text-foreground tracking-tight">
                    {originalId ? 'Edit item' : 'New item'}
                  </h2>
                  <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mt-1">
                    {originalId ? 'Details refine karein' : 'Scan karke shuru karein'}
                  </p>
                </div>
                <button
                  onClick={() => { if (!savingItem) setIsAdding(false); }}
                  className="w-12 h-12 bg-surface-container-high rounded-full flex items-center justify-center text-foreground"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSave} className="p-8 pt-2 space-y-6 max-h-[70vh] overflow-y-auto">
                {/* 1 + 2: Scan barcode, barcode value */}
                <BarcodeScanField
                  label="Scan barcode (recommended)"
                  autoFocus={!originalId}
                  onScan={code => {
                    const clash = StorageService.isBarcodeTaken(code, originalId || undefined);
                    if (clash) {
                      setFormMsg({ kind: 'err', text: `Ye barcode pehle se ${clash.name} ke saath linked hai.` });
                      return 'rejected';
                    }
                    setDraft(d => ({ ...d, barcode: code, barcodeEnabled: true }));
                    setFormMsg({ kind: 'ok', text: 'Barcode set ho gaya. Save karke link kar dein.' });
                    return 'added';
                  }}
                  cameraFeedback={formMsg}
                  lastScanMessage={draft.barcode ? `Barcode: ${draft.barcode}` : undefined}
                  hint="Scan ke baad barcode neeche field me aa jayega."
                />

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 block">
                    Barcode value
                  </label>
                  <input
                    value={draft.barcode || ''}
                    onChange={e => setDraft({ ...draft, barcode: e.target.value, barcodeEnabled: true })}
                    aria-label="Barcode value"
                    placeholder="Enter barcode"
                    className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] font-mono font-bold text-foreground outline-none"
                  />
                  {draft.barcode && (
                    <p className="text-[11px] font-bold text-muted-foreground px-2">
                      Format: {detectBarcodeFormat(draft.barcode)}{' '}
                      {isBarcodeStructurallyValid(draft.barcode) ? '· valid' : '· check digit match nahi kar raha'}
                    </p>
                  )}
                </div>

                {formMsg && (
                  <div
                    role={formMsg.kind === 'err' ? 'alert' : 'status'}
                    className={`rounded-2xl px-4 py-3 text-sm font-bold ${
                      formMsg.kind === 'ok'
                        ? 'bg-google-green/10 text-google-green'
                        : formMsg.kind === 'warn'
                        ? 'bg-amber-500/10 text-amber-700'
                        : 'bg-google-red/10 text-google-red'
                    }`}
                  >
                    {formMsg.text}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 block">
                    Product name *
                  </label>
                  <input
                    required
                    value={draft.name || ''}
                    onChange={e => setDraft({ ...draft, name: e.target.value })}
                    className="w-full p-5 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-xl font-black text-foreground outline-none font-heading"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 block">
                      Category
                    </label>
                    <input
                      value={draft.category || ''}
                      onChange={e => setDraft({ ...draft, category: e.target.value })}
                      className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] font-bold text-foreground outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 block">
                      Unit
                    </label>
                    <input
                      value={draft.unit || ''}
                      onChange={e => setDraft({ ...draft, unit: e.target.value })}
                      placeholder="pcs / kg / litre / box"
                      className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] font-bold text-foreground outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 block">
                      Selling price (₹) *
                    </label>
                    <input
                      required
                      type="number"
                      value={draft.price ?? ''}
                      onChange={e => setDraft({ ...draft, price: Number(e.target.value) })}
                      className="w-full p-5 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-lg font-bold text-foreground outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 block">
                      Purchase price (₹)
                    </label>
                    <input
                      type="number"
                      value={draft.purchasePrice ?? ''}
                      onChange={e =>
                        setDraft({
                          ...draft,
                          purchasePrice: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      className="w-full p-5 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-lg font-bold text-foreground outline-none"
                    />
                  </div>
                </div>

                {originalId ? (
                  <div className="rounded-2xl bg-surface-container-high p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                      Current stock
                    </p>
                    <p className="text-2xl font-black font-heading text-foreground">{draft.stock}</p>
                    <p className="text-[11px] font-bold text-muted-foreground mt-1">
                      Stock seedha edit nahi hota — history icon se Adjust Stock use karein (ledger me record hoga).
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 block">
                      Opening stock
                    </label>
                    <input
                      type="number"
                      value={draft.openingStock ?? 0}
                      onChange={e => setDraft({ ...draft, openingStock: Number(e.target.value) })}
                      className="w-full p-5 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-lg font-bold text-foreground outline-none"
                    />
                    <p className="text-[11px] font-bold text-muted-foreground px-2">
                      OPENING_STOCK movement ke roop me ledger me record hoga.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 block">
                      GST %
                    </label>
                    <input
                      type="number"
                      value={draft.gstRate ?? ''}
                      onChange={e =>
                        setDraft({ ...draft, gstRate: e.target.value === '' ? undefined : Number(e.target.value) })
                      }
                      className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] font-bold text-foreground outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 block">
                      HSN / SAC
                    </label>
                    <input
                      value={draft.hsn || ''}
                      onChange={e => setDraft({ ...draft, hsn: e.target.value })}
                      className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] font-bold text-foreground outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 block">MRP (₹)</label>
                    <input
                      type="number"
                      value={draft.mrp ?? ''}
                      onChange={e => setDraft({ ...draft, mrp: e.target.value === '' ? undefined : Number(e.target.value) })}
                      className="w-full p-4 bg-surface-container-high rounded-[24px] font-bold text-foreground outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 block">Wholesale (₹)</label>
                    <input
                      type="number"
                      value={draft.wholesalePrice ?? ''}
                      onChange={e => setDraft({ ...draft, wholesalePrice: e.target.value === '' ? undefined : Number(e.target.value) })}
                      className="w-full p-4 bg-surface-container-high rounded-[24px] font-bold text-foreground outline-none"
                    />
                  </div>
                  <div className="space-y-2 col-span-2 sm:col-span-1">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 block">Sec. Unit / Conv</label>
                    <div className="flex gap-2">
                      <input
                        placeholder="pcs"
                        value={draft.secondaryUnit || ''}
                        onChange={e => setDraft({ ...draft, secondaryUnit: e.target.value })}
                        className="w-1/2 p-4 bg-surface-container-high rounded-[24px] font-bold text-foreground outline-none text-xs"
                      />
                      <input
                        type="number"
                        placeholder="12"
                        value={draft.conversionRate ?? ''}
                        onChange={e => setDraft({ ...draft, conversionRate: e.target.value === '' ? undefined : Number(e.target.value) })}
                        className="w-1/2 p-4 bg-surface-container-high rounded-[24px] font-bold text-foreground outline-none text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Batch & Expiry Tracking */}
                <div className="p-4 rounded-[24px] bg-surface-container-high/60 border border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Batches &amp; Expiry ({(draft.batches || []).length})</span>
                    <button
                      type="button"
                      onClick={() => setDraft({
                        ...draft,
                        batches: [...(draft.batches || []), {
                          id: crypto.randomUUID(),
                          batchNo: `B-${((draft.batches || []).length + 1).toString().padStart(2, '0')}`,
                          sellingPrice: Number(draft.price || 0),
                          stock: 0,
                        }]
                      })}
                      className="text-xs font-bold text-google-blue hover:underline"
                    >
                      + Add Batch
                    </button>
                  </div>
                  {(draft.batches || []).map((b, bIdx) => (
                    <div key={b.id} className="grid grid-cols-4 gap-2 items-center">
                      <input
                        value={b.batchNo}
                        placeholder="Batch#"
                        onChange={e => {
                          const next = [...(draft.batches || [])];
                          next[bIdx] = { ...b, batchNo: e.target.value };
                          setDraft({ ...draft, batches: next });
                        }}
                        className="p-2 rounded-xl bg-white dark:bg-slate-900 text-xs font-bold outline-none"
                      />
                      <input
                        type="date"
                        value={b.expiryDate || ''}
                        onChange={e => {
                          const next = [...(draft.batches || [])];
                          next[bIdx] = { ...b, expiryDate: e.target.value };
                          setDraft({ ...draft, batches: next });
                        }}
                        className="p-2 rounded-xl bg-white dark:bg-slate-900 text-[11px] font-bold outline-none"
                      />
                      <input
                        type="number"
                        value={b.stock || ''}
                        placeholder="Qty"
                        onChange={e => {
                          const next = [...(draft.batches || [])];
                          next[bIdx] = { ...b, stock: Number(e.target.value) || 0 };
                          setDraft({ ...draft, batches: next });
                        }}
                        className="p-2 rounded-xl bg-white dark:bg-slate-900 text-xs font-bold outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setDraft({ ...draft, batches: (draft.batches || []).filter(x => x.id !== b.id) })}
                        className="text-xs font-bold text-red-500"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 block">
                    Low stock alert level
                  </label>
                  <input
                    type="number"
                    value={draft.lowStockThreshold ?? ''}
                    onChange={e =>
                      setDraft({
                        ...draft,
                        lowStockThreshold: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="Blank chhodein to default 10 use hoga"
                    className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] font-bold text-foreground outline-none"
                  />
                </div>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="submit"
                  disabled={savingItem}
                  className="w-full bg-google-blue text-white py-6 rounded-full font-black text-lg uppercase tracking-widest shadow-lg shadow-google-blue/20"
                >
                  {savingItem ? 'Saving item…' : 'Save item'}
                </motion.button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stock history / adjust drawer */}
      {drawerProduct && (
        <StockHistoryDrawer
          product={products.find(p => p.id === drawerProduct.id) || drawerProduct}
          onClose={() => setDrawerProduct(null)}
          onChanged={() => {
            refresh();
            setDrawerProduct(prev => (prev ? StorageService.getProducts().find(p => p.id === prev.id) || prev : prev));
          }}
        />
      )}
    </div>
  );
};

export default Inventory;
