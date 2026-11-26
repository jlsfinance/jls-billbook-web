import React, { useMemo, useState } from 'react';
import { ArrowLeft, Printer, Plus, Minus, Barcode as BarcodeIcon, RefreshCw, Search } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { Product } from '../types';

// Complete Code-128 bar/space width patterns (indices 0..106)
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

/**
 * Generates a binary bit-pattern ('1' = black bar module, '0' = white space module)
 * using Code-128 Set B (ASCII 32..126) with Start-B (104), modulo-103 checksum, and Stop (106).
 */
export const generateCode128Pattern = (rawText: string): string => {
  const sanitized = Array.from(rawText || '000000')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code <= 126;
    })
    .join('') || '000000';

  const codes: number[] = [104]; // Start Code B
  let checksum = 104;

  for (let i = 0; i < sanitized.length; i++) {
    const val = sanitized.charCodeAt(i) - 32;
    codes.push(val);
    checksum += val * (i + 1);
  }

  codes.push(checksum % 103);
  codes.push(106); // Stop

  let bits = '';
  codes.forEach((c) => {
    const widths = CODE128_PATTERNS[c] || CODE128_PATTERNS[0];
    for (let j = 0; j < widths.length; j++) {
      const w = Number(widths[j]);
      bits += (j % 2 === 0 ? '1' : '0').repeat(w);
    }
  });
  return bits;
};

export const renderCode128SvgMarkup = (code: string, width = 160, height = 36): string => {
  const bits = generateCode128Pattern(code);
  const modW = width / bits.length;
  let rects = '';
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === '1') {
      let run = 1;
      while (i + run < bits.length && bits[i + run] === '1') run++;
      rects += `<rect x="${(i * modW).toFixed(2)}" y="0" width="${(run * modW).toFixed(2)}" height="${height}" fill="#0f172a"/>`;
      i += run;
    } else {
      i++;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" shape-rendering="crispEdges"><rect width="${width}" height="${height}" fill="#ffffff"/>${rects}</svg>`;
};

const Code128Svg: React.FC<{ value: string; height?: number }> = ({ value, height = 38 }) => {
  const bits = useMemo(() => generateCode128Pattern(value), [value]);
  const totalWidth = bits.length;
  const rects: { x: number; w: number }[] = [];
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === '1') {
      let run = 1;
      while (i + run < bits.length && bits[i + run] === '1') run++;
      rects.push({ x: i, w: run });
      i += run;
    } else {
      i++;
    }
  }
  return (
    <svg
      viewBox={`0 0 ${totalWidth} ${height}`}
      className="w-full h-9"
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
    >
      <rect width={totalWidth} height={height} fill="#ffffff" />
      {rects.map((r, idx) => (
        <rect key={idx} x={r.x} y={0} width={r.w} height={height} fill="#0f172a" />
      ))}
    </svg>
  );
};

type SheetPreset = 'A4_65' | 'A4_40' | 'THERMAL_50x25_2UP' | 'THERMAL_50x25_1UP';

interface PresetConfig {
  id: SheetPreset;
  label: string;
  cols: number;
  widthMm: number;
  heightMm: number;
}

const PRESETS: PresetConfig[] = [
  { id: 'A4_65', label: 'A4 65-up (38×21mm)', cols: 5, widthMm: 38, heightMm: 21 },
  { id: 'A4_40', label: 'A4 40-up (52×29mm)', cols: 4, widthMm: 52, heightMm: 29 },
  { id: 'THERMAL_50x25_2UP', label: 'Thermal 2-up (50×25mm)', cols: 2, widthMm: 50, heightMm: 25 },
  { id: 'THERMAL_50x25_1UP', label: 'Thermal 1-up (50×25mm)', cols: 1, widthMm: 50, heightMm: 25 },
];

interface BarcodeLabelGeneratorProps {
  onBack?: () => void;
}

export const BarcodeLabelGenerator: React.FC<BarcodeLabelGeneratorProps> = ({ onBack }) => {
  const company = StorageService.getCompanyProfile();
  const [products, setProducts] = useState<Product[]>(() =>
    StorageService.getProducts().filter((p) => !p.isArchived && p.category !== 'Services')
  );
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    const first = StorageService.getProducts().find((p) => !p.isArchived && p.category !== 'Services');
    if (first) initial[first.id] = 4;
    return initial;
  });
  const [preset, setPreset] = useState<SheetPreset>('A4_65');
  const [showCompany, setShowCompany] = useState(true);
  const [showMrp, setShowMrp] = useState(true);
  const [showSalePrice, setShowSalePrice] = useState(true);
  const [showBatch, setShowBatch] = useState(false);

  const activePreset = PRESETS.find((p) => p.id === preset) || PRESETS[0];

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
    );
  }, [products, search]);

  const setProductCount = (id: string, nextVal: number) => {
    setCounts((prev) => {
      const clamped = Math.max(0, Math.min(200, Math.floor(nextVal)));
      if (clamped === 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: clamped };
    });
  };

  const assignMissingBarcodes = () => {
    const updated = products.map((p, idx) => {
      if (p.barcode && p.barcode.trim()) return p;
      const generated = `890${String(Date.now()).slice(-6)}${String(idx + 1).padStart(3, '0')}`;
      const nextProd: Product = { ...p, barcode: generated, barcodeFormat: 'CODE128', barcodeEnabled: true };
      StorageService.updateProduct(nextProd);
      return nextProd;
    });
    setProducts(updated);
  };

  const expandedLabels = useMemo(() => {
    const list: { product: Product; code: string }[] = [];
    products.forEach((p) => {
      const qty = counts[p.id] || 0;
      const code = (p.barcode || p.id.slice(0, 10)).trim();
      for (let i = 0; i < qty; i++) {
        list.push({ product: p, code });
      }
    });
    return list;
  }, [products, counts]);

  const handlePrintLabels = () => {
    if (expandedLabels.length === 0) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;

    const cardsHtml = expandedLabels
      .map(({ product, code }) => {
        const svg = renderCode128SvgMarkup(code, 180, 34);
        const activeBatch = product.batches?.[0]?.batchNo;
        return `
          <div class="lbl">
            ${showCompany ? `<div class="co">${company.name}</div>` : ''}
            <div class="nm">${product.name}</div>
            <div class="svg-wrap">${svg}</div>
            <div class="code">${code}</div>
            <div class="prices">
              ${showMrp && product.mrp ? `<span>MRP: ₹${product.mrp}</span>` : ''}
              ${showSalePrice ? `<b>₹${product.price}</b>` : ''}
            </div>
            ${showBatch && activeBatch ? `<div class="batch">Batch: ${activeBatch}</div>` : ''}
          </div>
        `;
      })
      .join('');

    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Print Barcode Labels - ${company.name}</title>
          <style>
            @page { margin: 6mm; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 8px; }
            .grid { display: grid; grid-template-columns: repeat(${activePreset.cols}, ${activePreset.widthMm}mm); gap: 2.5mm; }
            .lbl {
              width: ${activePreset.widthMm}mm;
              min-height: ${activePreset.heightMm}mm;
              border: 0.3mm dashed #cbd5e1;
              padding: 1.5mm;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              align-items: center;
              text-align: center;
              page-break-inside: avoid;
            }
            .co { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
            .nm { font-size: 7.5pt; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
            .svg-wrap { width: 92%; line-height: 0; }
            .code { font-size: 6.5pt; font-family: monospace; letter-spacing: 0.8px; }
            .prices { font-size: 7.5pt; display: flex; gap: 6px; justify-content: center; }
            .batch { font-size: 6pt; color: #475569; }
          </style>
        </head>
        <body>
          <div class="grid">${cardsHtml}</div>
          <script>window.onload = () => { window.print(); };</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-28">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="w-5 h-5 text-slate-700 dark:text-slate-200" />
            </button>
          )}
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <BarcodeIcon className="w-5 h-5 text-blue-600" />
              Barcode Label Studio
            </h1>
            <p className="text-xs text-slate-500">Generate & print Code-128 stickers for A4 or Thermal rolls</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handlePrintLabels}
          disabled={expandedLabels.length === 0}
          className="px-4 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-2 shadow-md"
        >
          <Printer className="w-4 h-4" />
          Print {expandedLabels.length} Labels
        </button>
      </div>

      <div className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Item Selection + Settings */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">Label Sheet Preset</span>
              <button
                type="button"
                onClick={assignMissingBarcodes}
                className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Auto-Assign Barcodes
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreset(p.id)}
                  className={`p-2.5 rounded-2xl text-left text-xs font-bold border transition-all ${
                    preset === p.id
                      ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 text-blue-700 dark:text-blue-300'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 pt-1">
              {[
                { label: 'Shop Name', val: showCompany, set: setShowCompany },
                { label: 'MRP', val: showMrp, set: setShowMrp },
                { label: 'Sale Price', val: showSalePrice, set: setShowSalePrice },
                { label: 'Batch No', val: showBatch, set: setShowBatch },
              ].map((t) => (
                <label key={t.label} className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={t.val}
                    onChange={(e) => t.set(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search item or barcode..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-sm font-medium outline-none text-slate-900 dark:text-white"
              />
            </div>

            <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {filteredProducts.map((p) => {
                const qty = counts[p.id] || 0;
                return (
                  <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{p.name}</p>
                      <p className="text-[11px] font-mono text-slate-500">
                        {p.barcode || 'No barcode'} · ₹{p.price}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setProductCount(p.id, qty - 1)}
                        className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={200}
                        value={qty}
                        onChange={(e) => setProductCount(p.id, Number(e.target.value))}
                        className="w-12 text-center py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setProductCount(p.id, qty + 1)}
                        className="w-7 h-7 rounded-full bg-blue-50 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-300"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Live Sheet Preview */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Live Sticker Sheet Preview ({activePreset.label})
            </h2>
            <span className="text-xs font-bold text-blue-600">{expandedLabels.length} total labels</span>
          </div>

          {expandedLabels.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-sm">
              <BarcodeIcon className="w-10 h-10 mb-2 opacity-40" />
              Select item quantities on the left to preview barcode labels
            </div>
          ) : (
            <div
              className="grid gap-2.5 max-h-[540px] overflow-y-auto p-3 bg-slate-100 dark:bg-slate-950 rounded-2xl"
              style={{ gridTemplateColumns: `repeat(${Math.min(activePreset.cols, 4)}, minmax(0, 1fr))` }}
            >
              {expandedLabels.slice(0, 48).map(({ product, code }, idx) => (
                <div
                  key={`${product.id}-${idx}`}
                  className="bg-white text-slate-900 border border-dashed border-slate-300 rounded-lg p-2 flex flex-col items-center text-center justify-between shadow-sm"
                >
                  {showCompany && (
                    <div className="text-[9px] font-black uppercase tracking-wider text-slate-600 truncate w-full">
                      {company.name}
                    </div>
                  )}
                  <div className="text-[11px] font-bold truncate w-full my-0.5">{product.name}</div>
                  <Code128Svg value={code} />
                  <div className="text-[9px] font-mono tracking-wider text-slate-600">{code}</div>
                  <div className="flex items-center gap-2 text-[10px] mt-0.5">
                    {showMrp && product.mrp ? (
                      <span className="line-through text-slate-400">₹{product.mrp}</span>
                    ) : null}
                    {showSalePrice && <span className="font-black text-slate-900">₹{product.price}</span>}
                  </div>
                  {showBatch && product.batches?.[0]?.batchNo && (
                    <div className="text-[8px] text-slate-500">Batch: {product.batches[0].batchNo}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BarcodeLabelGenerator;
