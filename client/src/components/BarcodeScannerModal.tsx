import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Keyboard, Minus, Plus, RefreshCw, ScanLine, Volume2, VolumeX, Zap, ZapOff } from 'lucide-react';
import { createCameraScanGate } from '../services/barcodeInput';
import { barcodeIdentity } from '../services/barcodeService';
import { startBarcodeCamera } from '../services/barcodeCamera';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

export type ScanOutcome = 'added' | 'unlinked' | 'rejected';
export type ScanQuantityDelta = -1 | 1;
export type ScanDraft = {
  title: string;
  lines: {
    id: string;
    productId?: string;
    name: string;
    quantity: number;
    amount?: number;
    changeQuantity: (delta: ScanQuantityDelta) => void;
  }[];
  total: number;
  totalLabel?: string;
};

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScan: (barcode: string) => ScanOutcome;
  onManualEntry: () => void;
  continuous: boolean;
  feedback?: { kind: 'ok' | 'warn' | 'err'; text: string; itemId?: string } | null;
  draft?: ScanDraft;
  soundOn: boolean;
  onToggleSound: () => void;
  onFinalize?: { label: string; run: () => void };
  linking?: { items: () => { id: string; name: string }[]; link: (code: string, productId: string) => Promise<ScanOutcome> };
}
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

export default function BarcodeScannerModal({
  open, onClose, onScan, onManualEntry, continuous, feedback, draft, soundOn, onToggleSound, onFinalize, linking,
}: BarcodeScannerModalProps) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const activeTrack = useRef<MediaStreamTrack | null>(null);
  const callback = useRef(onScan);
  callback.current = onScan;

  const [state, setState] = useState<'STARTING' | 'RUNNING' | 'PAUSED' | 'ERROR'>('STARTING');
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden');
  const scanGate = useRef(createCameraScanGate());
  const automaticRetry = useRef(false);
  const linkRequest = useRef(0);
  const [error, setError] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [lastScan, setLastScan] = useState<{ code: string; outcome: ScanOutcome; message?: string }>();
  const scanPaused = useRef(false);
  const [linkCode, setLinkCode] = useState('');
  const [productId, setProductId] = useState('');
  const [linkError, setLinkError] = useState('');
  const [linkSaving, setLinkSaving] = useState(false);

  function cancelLink() {
    scanPaused.current = false;
    setLinkCode('');
    setProductId('');
    setLinkError('');
  }

  async function confirmLink() {
    if (!linking || linkSaving || !productId) return;
    const request = ++linkRequest.current;
    setLinkSaving(true);
    setLinkError('');
    try {
      const outcome = await linking.link(linkCode, productId);
      if (linkRequest.current !== request) return;
      setLastScan({ code: linkCode, outcome });
      cancelLink();
    } catch (error) {
      if (linkRequest.current === request) setLinkError(error instanceof Error ? error.message : 'Barcode not saved. Try again.');
    } finally {
      if (linkRequest.current === request) setLinkSaving(false);
    }
  }

  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    if (open) return;
    linkRequest.current++;
    scanGate.current = createCameraScanGate();
    automaticRetry.current = false;
    setLastScan(undefined);
    setLinkSaving(false);
    cancelLink();
  }, [open]);

  useEffect(() => {
    if (!open || !video) return;
    if (!pageVisible) {
      setState('PAUSED');
      return;
    }
    setState('STARTING');
    setError('');
    setTorchOn(false);
    setTorchAvailable(false);
    let finished = false;
    const stop = startBarcodeCamera(video, {
      deviceId,
      paused: () => scanPaused.current,
      onFrame: code => {
        if (finished) return;
        const allowed = scanGate.current(code ? barcodeIdentity(code) : null, performance.now());
        if (!code || !allowed) return;
        try {
          const outcome = callback.current(code);
          finished = !continuous && outcome === 'added';
          setLastScan({ code, outcome });
        } catch (problem) {
          console.error('Could not process barcode', problem);
          setLastScan({ code, outcome: 'rejected', message: 'This scan could not be added. Move the label away and scan again.' });
        }
      },
      onReady: track => {
        activeTrack.current = track;
        setState('RUNNING');
        try {
          const settings = track.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
          setTorchAvailable(settings?.torch === true);
        } catch {
          setTorchAvailable(false);
        }
      },
      onDevices: setDevices,
      onError: (message, recoverable) => {
        activeTrack.current = null;
        setTorchAvailable(false);
        if (recoverable && !automaticRetry.current && document.visibilityState !== 'hidden') {
          automaticRetry.current = true;
          setAttempt(value => value + 1);
          return;
        }
        setState('ERROR');
        setError(message);
      },
    });
    return () => {
      activeTrack.current = null;
      stop();
    };
  }, [open, video, deviceId, attempt, continuous, pageVisible]);

  function retryCamera() {
    automaticRetry.current = false;
    setAttempt(value => value + 1);
  }

  async function toggleTorch() {
    const track = activeTrack.current;
    if (!track) return;
    try {
      const torch = !torchOn;
      await track.applyConstraints({ advanced: [{ torch } as MediaTrackConstraintSet] });
      if (track === activeTrack.current) setTorchOn(torch);
    } catch {
      if (track === activeTrack.current) setTorchAvailable(false);
    }
  }

  const linkItems = linkCode ? linking?.items() ?? [] : [];
  const units = draft?.lines.reduce((count, line) => count + line.quantity, 0) ?? 0;
  const shownLines = draft?.lines.filter(line => line.quantity > 0) ?? [];
  const highlighted = lastScan?.outcome === 'added' ? shownLines.find(line => (line.productId ?? line.id) === feedback?.itemId) : undefined;
  const orderedLines = highlighted ? [highlighted, ...shownLines.filter(line => line.id !== highlighted.id)] : shownLines;

  return <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
    <DialogContent className="z-[300] flex max-h-[94dvh] w-[calc(100%_-_1rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:w-11/12">
      <DialogHeader className="px-4 pb-2 pt-4 pr-12 text-left">
        <DialogTitle>{continuous ? 'Scan items' : 'Scan barcode'}</DialogTitle>
        <DialogDescription className="text-xs">{continuous ? 'Each scan adds one. Move a label out of view and back to scan it again.' : 'Scan the label to fill the barcode field.'}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 py-2">
      <div className="relative h-[clamp(108px,27dvh,245px)] overflow-hidden rounded-xl bg-black">
        <video ref={setVideo} className="h-full w-full object-contain" autoPlay playsInline muted />
        {state === 'RUNNING'
          ? <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="h-[40%] w-[80%] rounded-lg border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.25)]" />
          </div>
          : <div role={state === 'ERROR' ? 'alert' : 'status'} className="absolute inset-0 grid place-content-center justify-items-center gap-3 px-4 text-center text-sm font-medium text-white">
            {state === 'ERROR' ? <AlertTriangle className="text-amber-300" /> : <RefreshCw className={state === 'STARTING' ? 'animate-spin' : ''} />}
            {state === 'STARTING' ? 'Starting camera…' : state === 'PAUSED' ? 'Camera paused' : error}
          </div>}
      </div>
      {lastScan && <div className="rounded-lg border px-3 py-2 text-sm">
        <div role="status" className="flex items-start gap-2">
          {lastScan.outcome === 'added' ? <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" /> : <ScanLine size={16} className="mt-0.5 shrink-0" />}
          <p className={`min-w-0 break-words ${lastScan.outcome === 'added' && feedback?.kind !== 'warn' ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
            {lastScan.message || feedback?.text || lastScan.code}
          </p>
        </div>
        {lastScan.outcome === 'unlinked' && linking && !linkCode && <button type="button" className="mt-2 rounded-lg border px-3 py-2 text-xs font-semibold" onClick={() => {
          scanPaused.current = true;
          setLinkCode(lastScan.code);
        }}>Link to an item</button>}
        {linkCode && <div className="mt-2 space-y-2">
          {linkItems.length ? <select aria-label="Item without a barcode" disabled={linkSaving} value={productId} onChange={event => setProductId(event.target.value)} className="w-full rounded-lg border bg-background p-2 text-sm">
            <option value="">Select an item without a barcode</option>
            {linkItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select> : <p className="text-xs text-muted-foreground">Add a new item under Items or Stock In to use this barcode.</p>}
          {linkError && <p role="alert" className="text-xs text-red-600">{linkError}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={cancelLink} disabled={linkSaving} className="rounded-lg border px-3 py-2 text-xs">Keep scanning</button>
            {linkItems.length > 0 && <button type="button" disabled={!productId || linkSaving} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50" onClick={confirmLink}>{linkSaving ? 'Saving barcode…' : 'Link & add 1'}</button>}
          </div>
        </div>}
      </div>}
      {draft && <section aria-label={draft.title} className="rounded-xl border">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h3 className="text-sm font-semibold">{draft.title}</h3>
          <span aria-live="polite" className="text-xs tabular-nums text-muted-foreground">{units} {units === 1 ? 'unit' : 'units'}</span>
        </div>
        {orderedLines.length ? <ul className="max-h-36 divide-y overflow-y-auto">
          {orderedLines.map(line => <li key={line.id} className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 text-sm ${line.id === highlighted?.id ? 'bg-emerald-500/10' : ''}`}>
            <span className="min-w-[8ch] flex-1 break-words font-medium">{line.name}</span>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <div role="group" aria-label={`Quantity controls for ${line.name}`} className="flex shrink-0 items-center rounded-lg border bg-background">
                <button type="button" aria-label={`Decrease quantity of ${line.name}`} onClick={() => line.changeQuantity(-1)}
                  className="grid h-11 w-10 place-items-center rounded-l-lg text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-primary">
                  <Minus size={16} aria-hidden="true" />
                </button>
                <span className="min-w-7 px-0.5 text-center text-xs font-semibold tabular-nums" aria-label={`Quantity ${line.quantity}`}>{line.quantity}</span>
                <button type="button" aria-label={`Increase quantity of ${line.name}`} onClick={() => line.changeQuantity(1)}
                  className="grid h-11 w-10 place-items-center rounded-r-lg text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-primary">
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
              {line.amount !== undefined && <span className="shrink-0 whitespace-nowrap text-xs tabular-nums sm:text-sm">{currency.format(line.amount)}</span>}
            </div>
          </li>)}
        </ul> : <p className="px-3 py-3 text-xs text-muted-foreground">Scan an item to start.</p>}
      </section>}
      <div className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={soundOn} onClick={onToggleSound} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium">
          {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />} Sound {soundOn ? 'on' : 'off'}
        </button>
        {devices.length > 1 && <select aria-label="Camera" value={deviceId} onChange={event => { automaticRetry.current = false; setDeviceId(event.target.value); }} className="min-w-0 max-w-full rounded-lg border bg-background p-2 text-sm">
          <option value="">Automatic camera</option>
          {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
        </select>}
        {torchAvailable && <button type="button" aria-pressed={torchOn} onClick={() => void toggleTorch()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          {torchOn ? <ZapOff size={16} /> : <Zap size={16} />} {torchOn ? 'Torch off' : 'Torch on'}
        </button>}
        {state === 'ERROR' && <button type="button" onClick={retryCamera} className="rounded-lg border px-3 py-2 text-sm">Retry camera</button>}
        <button type="button" onClick={onManualEntry} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <Keyboard size={16} /> Enter barcode
        </button>
      </div>
      </div>
      {continuous && <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {draft && <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{draft.totalLabel || 'Bill total'}</p>
          <p className="text-base font-bold tabular-nums">{currency.format(draft.total)}</p>
        </div>}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onClose} className={`min-h-11 rounded-lg px-4 text-sm font-bold ${onFinalize ? 'border' : 'bg-primary text-primary-foreground'}`}>Done</button>
          {onFinalize && <button type="button" disabled={!orderedLines.length || !!linkCode} onClick={onFinalize.run} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">{onFinalize.label}</button>}
        </div>
      </div>}
    </DialogContent>
  </Dialog>;
}
