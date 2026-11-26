import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { ScanLine, Camera, X, CheckCircle2 } from 'lucide-react';
import { normalizeScannedBarcode, SCAN_IDLE_MS } from '../services/barcodeService';
import type { BarcodeSource } from '../services/barcodeService';
import { isScannerBurst, recordBarcodeInput } from '../services/barcodeInput';
import type { BarcodeBurst } from '../services/barcodeInput';
import BarcodeScannerModal from './BarcodeScannerModal';
import type { ScanDraft, ScanOutcome } from './BarcodeScannerModal';
import { SoundService } from '../services/soundService';
import { StorageService } from '../services/storageService';

export interface BarcodeScanFieldProps {
  onScan: (barcode: string, source: BarcodeSource) => ScanOutcome | void;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  hint?: string;
  lastScanMessage?: string;
  enableCamera?: boolean;
  continuous?: boolean;
  cameraFeedback?: { kind: 'ok' | 'warn' | 'err'; text: string; itemId?: string } | null;
  scanDraft?: ScanDraft;
  finalize?: { label: string; run: () => boolean };
  linkUnmatched?: boolean;
  className?: string;
  inputClassName?: string;
}

const emptyInput: BarcodeBurst = { value: '', lastAt: 0, characters: 0 };

export default function BarcodeScanField({
  onScan, label = 'Barcode', placeholder = 'Scan or enter a barcode', autoFocus = false,
  disabled = false, hint, lastScanMessage, enableCamera = true, continuous = false, cameraFeedback,
  scanDraft, finalize, linkUnmatched = false,
  className = '', inputClassName = '',
}: BarcodeScanFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraButtonRef = useRef<HTMLButtonElement>(null);
  const idleTimer = useRef<number>(0);
  const flashTimer = useRef<number>(0);
  const buffer = useRef<BarcodeBurst>(emptyInput);
  const callback = useRef(onScan);
  callback.current = onScan;
  const [value, setValue] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const cameraSession = useRef(0);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState('');
  const [soundOn, setSoundOn] = useState(true);

  function clear() {
    window.clearTimeout(idleTimer.current);
    buffer.current = emptyInput;
    setValue('');
    setError('');
  }

  function accept(code: string, source: BarcodeSource): ScanOutcome {
    const outcome = callback.current(code, source) ?? 'added';
    if (soundOn) {
      try { SoundService.playScan(outcome === 'added'); } catch (problem) { console.warn('Barcode sound was unavailable', problem); }
    }
    if (outcome === 'added') {
      setFlash(true);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(false), 600);
    }
    return outcome;
  }

  function submit() {
    window.clearTimeout(idleTimer.current);
    const current = buffer.current;
    if (!current.value || disabled) return;
    const code = normalizeScannedBarcode(current.value);
    if (!code) {
      setError('Enter a valid barcode of up to 128 characters.');
      return;
    }
    clear();
    if (soundOn) void SoundService.resume();
    accept(code, isScannerBurst(current) ? 'USB' : 'MANUAL');
  }

  function change(event: ChangeEvent<HTMLInputElement>) {
    const inputType = (event.nativeEvent as InputEvent).inputType || '';
    const next = recordBarcodeInput(buffer.current, event.target.value, performance.now(), inputType);
    buffer.current = next;
    setValue(next.value);
    setError('');
    window.clearTimeout(idleTimer.current);
    if (isScannerBurst(next)) {
      idleTimer.current = window.setTimeout(() => {
        if (document.activeElement === inputRef.current && buffer.current === next) submit();
      }, SCAN_IDLE_MS);
    }
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (soundOn) void SoundService.resume();
    if (event.key === 'Enter' || (event.key === 'Tab' && isScannerBurst(buffer.current))) {
      event.preventDefault();
      submit();
    }
  }

  function closeCamera(focusBarcode: boolean) {
    const session = ++cameraSession.current;
    setCameraOpen(false);
    requestAnimationFrame(() => {
      if (session === cameraSession.current) (focusBarcode ? inputRef.current : cameraButtonRef.current)?.focus();
    });
  }

  async function linkBarcode(code: string, productId: string): Promise<ScanOutcome> {
    const item = StorageService.getProducts().find(product => product.id === productId && !product.isArchived && !product.barcode);
    if (!item) throw new Error('Choose an active item without a barcode.');
    const session = cameraSession.current;
    await StorageService.saveProductConfirmed({ ...item, barcode: code, barcodeEnabled: true }, true);
    return session === cameraSession.current ? accept(code, 'CAMERA') : 'rejected';
  }

  useEffect(() => {
    if (disabled || cameraOpen) window.clearTimeout(idleTimer.current);
  }, [disabled, cameraOpen]);

  useEffect(() => () => {
    window.clearTimeout(idleTimer.current);
    window.clearTimeout(flashTimer.current);
  }, []);

  useEffect(() => {
    if (!autoFocus || disabled) return;
    const session = cameraSession.current;
    const timer = window.setTimeout(() => {
      if (cameraSession.current === session) inputRef.current?.focus({ preventScroll: true });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [autoFocus, disabled]);

  return <div className={`space-y-2 ${className}`}>
    <label htmlFor={id} className="block px-1 text-xs font-semibold text-muted-foreground">{label}</label>
    <div className="flex flex-wrap gap-2">
      <div className="relative min-w-0 flex-1">
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
          {flash ? <CheckCircle2 size={18} className="text-emerald-600" /> : <ScanLine size={18} />}
        </div>
        <input id={id} ref={inputRef} value={value} disabled={disabled} inputMode="text" autoComplete="off" spellCheck={false}
          placeholder={placeholder} onPointerDown={() => { if (soundOn) void SoundService.resume(); }} onChange={change} onKeyDown={keyDown} onBlur={() => window.clearTimeout(idleTimer.current)}
          className={`w-full rounded-xl border bg-background py-3 pl-10 pr-9 font-mono text-sm outline-none focus:ring-2 focus:ring-primary/40 ${inputClassName}`} />
        {value && <button type="button" aria-label="Clear barcode" onClick={() => { clear(); inputRef.current?.focus(); }}
          className="absolute inset-y-0 right-2 p-1 text-muted-foreground"><X size={16} /></button>}
      </div>
      {value && <button type="button" disabled={disabled} onClick={submit} className="rounded-xl border px-3 text-sm font-semibold">Use code</button>}
      {enableCamera && <button ref={cameraButtonRef} type="button" disabled={disabled} aria-label="Open camera scanner" onClick={() => {
        window.clearTimeout(idleTimer.current);
        if (soundOn) void SoundService.resume();
        cameraSession.current++;
        setCameraOpen(true);
      }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        <Camera size={18} /><span>{continuous ? 'Scan items' : 'Camera'}</span>
      </button>}
    </div>
    {error ? <p role="alert" className="px-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      : <p className="px-1 text-xs text-muted-foreground">{lastScanMessage || hint || 'Type a code and press Enter. Keep this field focused for a USB or Bluetooth scanner.'}</p>}
    <BarcodeScannerModal open={cameraOpen && !disabled} continuous={continuous} feedback={cameraFeedback}
      draft={scanDraft} soundOn={soundOn} onToggleSound={() => {
        if (!soundOn) void SoundService.resume();
        setSoundOn(!soundOn);
      }}
      onFinalize={finalize && { label: finalize.label, run: () => {
        if (finalize.run()) closeCamera(false);
      } }}
      linking={linkUnmatched ? {
        items: () => StorageService.getProducts().filter(product => !product.isArchived && !product.barcode),
        link: linkBarcode,
      } : undefined}
      onClose={() => closeCamera(false)} onManualEntry={() => closeCamera(true)} onScan={code => {
        clear();
        const outcome = accept(code, 'CAMERA');
        if (!continuous && outcome === 'added') closeCamera(true);
        return outcome;
      }} />
  </div>;
}
