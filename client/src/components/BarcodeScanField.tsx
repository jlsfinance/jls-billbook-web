import React, { useEffect, useRef, useState } from 'react';
import { ScanLine, Camera, X, CheckCircle2 } from 'lucide-react';
import { normalizeBarcode, SCAN_IDLE_MS } from '../services/barcodeService';
import type { BarcodeSource } from '../services/barcodeService';
import BarcodeScannerModal from './BarcodeScannerModal';

export interface BarcodeScanFieldProps {
  /** Fired once per accepted scan with the normalized value. */
  onScan: (barcode: string, source: BarcodeSource) => void;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  hint?: string;
  /** Short confirmation text rendered under the field after a scan. */
  lastScanMessage?: string;
  /** Render the camera button (default true). */
  enableCamera?: boolean;
  className?: string;
  inputClassName?: string;
}

/**
 * The one scan input used by Inventory, Billing and Stock-In.
 *
 * Supports:
 *  - USB / Bluetooth scanners in keyboard-wedge mode (they type + send Enter/Tab)
 *  - Scanners that do NOT send a suffix key: a short inactivity timer flushes the buffer
 *  - Plain manual typing (Enter to submit)
 *
 * The source is inferred from typing speed: machine-fast input is tagged USB,
 * human-speed input is tagged MANUAL. Used for analytics only.
 */
const BarcodeScanField: React.FC<BarcodeScanFieldProps> = ({
  onScan,
  label = 'Barcode',
  placeholder = 'Scan karein ya barcode type karein…',
  autoFocus = false,
  disabled = false,
  hint,
  lastScanMessage,
  enableCamera = true,
  className = '',
  inputClassName = '',
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const idleTimer = useRef<number | null>(null);
  const bufferStart = useRef<number>(0);
  const lastKeyAt = useRef<number>(0);

  const [value, setValue] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [flash, setFlash] = useState(false);

  const clearIdle = () => {
    if (idleTimer.current !== null) {
      window.clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  };

  /** Machine scanners deliver the whole string in a few ms per character. */
  const inferSource = (): BarcodeSource => {
    const len = value.length || 1;
    const span = Math.max(lastKeyAt.current - bufferStart.current, 0);
    return span / len < 30 ? 'USB' : 'MANUAL';
  };

  const flush = (source?: BarcodeSource) => {
    clearIdle();
    const normalized = normalizeBarcode(value);
    setValue('');
    if (!normalized) return;
    setFlash(true);
    window.setTimeout(() => setFlash(false), 600);
    onScan(normalized, source || inferSource());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (value) {
        e.preventDefault();
        flush();
      }
      return;
    }
    const now = Date.now();
    if (!value) bufferStart.current = now;
    lastKeyAt.current = now;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    const now = Date.now();
    if (!value && next) bufferStart.current = now;
    lastKeyAt.current = now;
    setValue(next);

    // Scanners without an Enter/Tab suffix: flush after a short idle gap.
    clearIdle();
    if (next.trim().length >= 4) {
      idleTimer.current = window.setTimeout(() => flush(), SCAN_IDLE_MS);
    }
  };

  useEffect(() => () => clearIdle(), []);

  useEffect(() => {
    if (autoFocus && !disabled) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 120);
      return () => window.clearTimeout(t);
    }
  }, [autoFocus, disabled]);

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 block">
          {label}
        </label>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
            {flash ? (
              <CheckCircle2 className="w-5 h-5 text-google-green" />
            ) : (
              <ScanLine className="w-5 h-5" />
            )}
          </div>
          <input
            ref={inputRef}
            value={value}
            disabled={disabled}
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={`w-full pl-12 pr-10 py-4 rounded-[20px] bg-surface-container-high border-2 font-mono font-bold text-foreground outline-none transition-all ${
              focused ? 'border-google-blue/40 ring-4 ring-google-blue/5' : 'border-transparent'
            } ${inputClassName}`}
          />
          {value && (
            <button
              type="button"
              onClick={() => setValue('')}
              aria-label="Clear"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-surface-container-highest flex items-center justify-center text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {enableCamera && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setCameraOpen(true)}
            className="px-5 rounded-[20px] bg-google-blue text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-google-blue/20 disabled:opacity-50"
          >
            <Camera className="w-5 h-5" />
            <span className="hidden sm:inline">Camera</span>
          </button>
        )}
      </div>

      {!focused && !disabled && (
        <p className="text-[11px] font-bold text-amber-600 px-2">
          Click to activate scanner — USB/Bluetooth scanner ke liye box par focus zaroori hai.
        </p>
      )}

      {hint && !lastScanMessage && (
        <p className="text-[11px] font-bold text-muted-foreground px-2">{hint}</p>
      )}

      {lastScanMessage && (
        <p className="text-[11px] font-black text-google-green px-2">{lastScanMessage}</p>
      )}

      <BarcodeScannerModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onScan={(code) => {
          onScan(normalizeBarcode(code), 'CAMERA');
        }}
      />
    </div>
  );
};

export default BarcodeScanField;
