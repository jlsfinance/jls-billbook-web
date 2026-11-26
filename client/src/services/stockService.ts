/**
 * Stock ledger helpers — PURE functions only.
 *
 * Deliberately imports nothing from storageService so there is no circular
 * dependency: StorageService owns the cache + persistence and calls into here.
 *
 * Invariant enforced everywhere: stockAfter === stockBefore + quantityDelta
 */

import { Product, StockEntry, StockMovement, StockMovementType } from '../types';

export interface MovementInput {
  productId: string;
  barcodeSnapshot?: string;
  movementType: StockMovementType;
  quantityDelta: number;
  stockBefore: number;
  unitCost?: number;
  referenceType?: StockMovement['referenceType'];
  referenceId?: string;
  reason?: string;
  performedBy?: string;
  idempotencyKey?: string;
}

const uuid = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `mv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

/** Build an immutable ledger row from a movement request. */
export const buildMovement = (input: MovementInput, userId?: string): StockMovement => {
  const delta = Number(input.quantityDelta) || 0;
  const before = Number(input.stockBefore) || 0;
  return {
    id: uuid(),
    userId,
    productId: input.productId,
    barcodeSnapshot: input.barcodeSnapshot,
    movementType: input.movementType,
    quantityDelta: delta,
    stockBefore: before,
    stockAfter: before + delta,
    unitCost: input.unitCost,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    reason: input.reason,
    performedBy: input.performedBy,
    idempotencyKey: input.idempotencyKey,
    createdAt: new Date().toISOString(),
  };
};

/** Returns an error message, or null when the movement is valid. */
export const validateMovement = (m: StockMovement, allowNegative = false): string | null => {
  if (!m.productId) return 'Product ID missing hai.';
  if (!m.quantityDelta) return 'Stock change zero nahi ho sakta.';
  if (m.stockAfter !== m.stockBefore + m.quantityDelta) {
    return 'Stock ledger mismatch: stockAfter ≠ stockBefore + delta.';
  }
  if (m.stockAfter < 0 && !allowNegative) {
    return `Available stock ${m.stockBefore} hai. Itna stock kam nahi kar sakte.`;
  }
  return null;
};

/** Apply a delta to a product, stamping updatedAt and any extra patch. */
export const applyDeltaToProduct = (
  product: Product,
  delta: number,
  patch: Partial<Product> = {}
): Product => ({
  ...product,
  ...patch,
  stock: Number(product.stock || 0) + Number(delta || 0),
  updatedAt: new Date().toISOString(),
});

/** Sum of the ledger for one product — used for reconciliation. */
export const computeStockFromLedger = (movements: StockMovement[], productId: string): number =>
  movements
    .filter((m) => m.productId === productId)
    .reduce((acc, m) => acc + Number(m.quantityDelta || 0), 0);

export interface ReconcileRow {
  productId: string;
  productName: string;
  productStock: number;
  ledgerStock: number;
  difference: number;
}

/**
 * Compare each product's cached stock against its ledger total.
 * Non-empty result means something wrote stock without a movement row.
 */
export const reconcile = (products: Product[], movements: StockMovement[]): ReconcileRow[] => {
  const rows: ReconcileRow[] = [];
  products.forEach((p) => {
    const ledger = computeStockFromLedger(movements, p.id);
    const current = Number(p.stock || 0);
    if (ledger !== current) {
      rows.push({
        productId: p.id,
        productName: p.name,
        productStock: current,
        ledgerStock: ledger,
        difference: current - ledger,
      });
    }
  });
  return rows;
};

export const hasIdempotencyKey = (movements: StockMovement[], key?: string): boolean =>
  !!key && movements.some((m) => m.idempotencyKey === key);

const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  OPENING_STOCK: 'Opening Stock',
  STOCK_IN: 'Stock In',
  SALE: 'Sale',
  SALE_RETURN: 'Sale Return',
  DAMAGE: 'Damage',
  ADJUSTMENT_IN: 'Adjustment In',
  ADJUSTMENT_OUT: 'Adjustment Out',
  STOCK_COUNT_CORRECTION: 'Stock Count Correction',
};

export const movementLabel = (t: StockMovementType): string => MOVEMENT_LABELS[t] || t;

/** Human-readable stock-in entry number, e.g. SI-20261021-0001 */
export const nextEntryNumber = (entries: StockEntry[], date = new Date()): string => {
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(
    date.getDate()
  ).padStart(2, '0')}`;
  const prefix = `SI-${ymd}-`;
  const used = entries.filter((e) => (e.entryNumber || '').startsWith(prefix)).length;
  return `${prefix}${String(used + 1).padStart(4, '0')}`;
};

/** Turn a stock adjustment UI type into a ledger movement type + delta sign. */
export const adjustmentToMovement = (
  kind: 'INCREASE' | 'DECREASE' | 'CORRECTION' | 'DAMAGE' | 'RETURN',
  quantity: number
): { movementType: StockMovementType; delta: number } => {
  const q = Math.abs(Number(quantity) || 0);
  switch (kind) {
    case 'INCREASE':
      return { movementType: 'ADJUSTMENT_IN', delta: q };
    case 'DECREASE':
      return { movementType: 'ADJUSTMENT_OUT', delta: -q };
    case 'DAMAGE':
      return { movementType: 'DAMAGE', delta: -q };
    case 'RETURN':
      return { movementType: 'SALE_RETURN', delta: q };
    case 'CORRECTION':
    default:
      return { movementType: 'STOCK_COUNT_CORRECTION', delta: Number(quantity) || 0 };
  }
};
