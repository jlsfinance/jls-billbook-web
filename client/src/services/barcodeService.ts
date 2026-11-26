/**
 * Barcode utilities — normalization, format detection, validation, lookup.
 *
 * Core design rule: a barcode is an OPAQUE STRING.
 *   - Leading zeros are preserved ("0123456789012" stays exactly that)
 *   - It is NEVER coerced to a number
 *   - Whitespace / control / zero-width characters are stripped before storage
 *   - Hard length cap of 128 characters (PRD §12 Security)
 *
 * These are pure functions so both the UI and StorageService can use them
 * without creating a circular import.
 */

import { Product } from '../types';

export const MAX_BARCODE_LENGTH = 128;

/** Idle window after which a keyboard-wedge scan is flushed even without a suffix key. */
export const SCAN_IDLE_MS = 180;

export type BarcodeFormat =
  | 'EAN-13'
  | 'EAN-8'
  | 'UPC-A'
  | 'UPC-E'
  | 'ITF-14'
  | 'CODE128'
  | 'CODE39'
  | 'QR'
  | 'GENERIC';

export type BarcodeSource = 'CAMERA' | 'USB' | 'BLUETOOTH' | 'MANUAL';

export interface BarcodeLookupResult {
  found: boolean;
  product: Product | null;
  normalized: string;
  format: BarcodeFormat;
  valid: boolean;
  archived: boolean;
}

/**
 * Strip control chars, zero-width chars and all whitespace.
 * Digits (including leading zeros) are never altered.
 */
const cleanBarcode = (raw: string | number | null | undefined): string => {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // CR, LF, TAB, scanner suffixes
    .replace(/[\u200B-\u200D\uFEFF]/g, '')        // zero-width space/joiner, BOM
    .replace(/\s+/g, '');                        // every remaining whitespace
};

export const normalizeBarcode = (raw: string | number | null | undefined): string =>
  cleanBarcode(raw).slice(0, MAX_BARCODE_LENGTH);

export function normalizeScannedBarcode(raw: string) {
  const value = cleanBarcode(raw);
  return value.length <= MAX_BARCODE_LENGTH && /^[\x20-\x7E]+$/.test(value) ? value : '';
}

/**
 * GTIN mod-10 check digit for EAN-8/12/13 and ITF-14.
 * Non-GTIN values (Code128 etc.) always pass — we only warn, never block.
 */
export const isValidGtinCheckDigit = (value: string): boolean => {
  if (!/^\d+$/.test(value)) return true;
  if (![8, 12, 13, 14].includes(value.length)) return true;
  const digits = value.split('').map(Number);
  const check = digits.pop() as number;
  let sum = 0;
  digits.reverse().forEach((d, i) => {
    sum += d * (i % 2 === 0 ? 3 : 1);
  });
  return (10 - (sum % 10)) % 10 === check;
};

/**
 * Best-effort format detection from the raw string.
 * NOTE: Code39 and Code128 cannot be told apart from the decoded value alone;
 * alphanumeric ASCII is reported as CODE128 (the superset) by convention.
 */
export const detectBarcodeFormat = (value: string): BarcodeFormat => {
  const v = normalizeBarcode(value);
  if (!v) return 'GENERIC';
  if (/^\d{13}$/.test(v)) return 'EAN-13';
  if (/^\d{12}$/.test(v)) return 'UPC-A';
  if (/^\d{8}$/.test(v)) return 'EAN-8';
  if (/^\d{14}$/.test(v)) return 'ITF-14';
  if (/^\d{6}$/.test(v)) return 'UPC-E';
  if (/^[\x20-\x7E]+$/.test(v) && /[A-Za-z]/.test(v)) return 'CODE128';
  if (/^\d+$/.test(v)) return 'GENERIC';
  return 'GENERIC';
};

/** Structural validation: non-empty, printable ASCII, within length cap, valid GTIN check digit. */
export const isBarcodeStructurallyValid = (value: string): boolean => {
  const v = normalizeScannedBarcode(value);
  if (!v) return false;
  return isValidGtinCheckDigit(v);
};

/** Case-insensitive comparison of two barcodes. */
export const barcodesMatch = (a: string, b: string): boolean => {
  const x = normalizeBarcode(a).toLowerCase();
  const y = normalizeBarcode(b).toLowerCase();
  return !!x && x === y;
};

export interface LookupOptions {
  includeArchived?: boolean;
  includeDisabled?: boolean;
}

function upcAlias(value: string) {
  if (!isValidGtinCheckDigit(value)) return '';
  if (/^\d{12}$/.test(value)) return `0${value}`;
  return /^0\d{12}$/.test(value) ? value.slice(1) : '';
}

/** Give UPC-A and its zero-prefixed EAN-13 form the same camera identity. */
export function barcodeIdentity(code: string) {
  const value = code.toLowerCase();
  return value.length === 13 ? upcAlias(value) || value : value;
}

/** Find the product linked to a barcode inside one business scope. */
export const findProductByBarcode = (
  products: Product[],
  barcode: string,
  opts: LookupOptions = {}
): Product | null => {
  const v = normalizeScannedBarcode(barcode);
  if (!v) return null;
  const expected = v.toLowerCase();
  const alias = upcAlias(v);
  let aliasMatch: Product | null = null;
  for (const product of products) {
    if (!product.barcode || (!opts.includeArchived && product.isArchived) ||
        (!opts.includeDisabled && product.barcodeEnabled === false)) continue;
    const candidate = normalizeBarcode(product.barcode).toLowerCase();
    if (candidate === expected) return product;
    if (!aliasMatch && alias && candidate === alias) aliasMatch = product;
  }
  return aliasMatch;
};

/** Duplicate protection: same business cannot reuse a barcode on another product. */
export const isBarcodeTaken = (
  products: Product[],
  barcode: string,
  excludeProductId?: string
): Product | null => {
  const v = normalizeScannedBarcode(barcode);
  if (!v) return null;
  return findProductByBarcode(products.filter(product => product.id !== excludeProductId), v, {
    includeArchived: true, includeDisabled: true,
  });
};

/** Full lookup used by every scan surface (inventory, billing, stock-in). */
export const lookupBarcode = (
  products: Product[],
  barcode: string,
  opts: LookupOptions = {}
): BarcodeLookupResult => {
  const normalized = normalizeScannedBarcode(barcode);
  const format = detectBarcodeFormat(normalized);
  const product = findProductByBarcode(products, normalized, opts);
  const anyMatch = product ?? findProductByBarcode(products, normalized, { includeArchived: true, includeDisabled: true });
  return {
    found: !!product,
    product,
    normalized,
    format,
    valid: Boolean(anyMatch) || isBarcodeStructurallyValid(normalized),
    archived: !product && Boolean(anyMatch?.isArchived),
  };
};

/**
 * Stable, non-reversible hash for analytics. Raw barcode values must not be
 * stored in analytics (PRD §15). This is NOT cryptographic — it is only meant
 * to make the same barcode group together without exposing the value.
 */
export const hashBarcode = (value: string): string => {
  const v = normalizeBarcode(value);
  if (!v) return '';
  let h = 5381;
  for (let i = 0; i < v.length; i++) {
    h = ((h << 5) + h + v.charCodeAt(i)) | 0;
  }
  return `bc_${(h >>> 0).toString(16)}`;
};

/** Human label for a detected format. */
export const formatLabel = (format: BarcodeFormat): string => format;

/** Effective low-stock threshold (per-product override, else global default). */
export const lowStockThresholdFor = (product: Product, globalDefault = 10): number =>
  typeof product.lowStockThreshold === 'number' && product.lowStockThreshold >= 0
    ? product.lowStockThreshold
    : globalDefault;

export type StockState = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export const stockStateOf = (product: Product, globalDefault = 10): StockState => {
  const stock = Number(product.stock || 0);
  if (stock <= 0) return 'OUT_OF_STOCK';
  if (stock <= lowStockThresholdFor(product, globalDefault)) return 'LOW_STOCK';
  return 'IN_STOCK';
};
