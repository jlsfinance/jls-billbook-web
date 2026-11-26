import { useEffect, useRef, useState } from 'react';
import type { IScannerControls } from '@zxing/browser';
import { AlertTriangle, Keyboard, RefreshCw, ScanLine, Zap, ZapOff } from 'lucide-react';
import { createCameraScanGate } from '../services/barcodeInput';
import { normalizeScannedBarcode } from '../services/barcodeService';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  onManualEntry: () => void;
  continuous: boolean;
  feedback?: { kind: 'ok' | 'warn' | 'err'; text: string } | null;
}

function cameraError(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was blocked. Allow camera access for this site or enter the barcode.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No matching camera was found. Try another camera or enter the barcode.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'The camera could not start. Close other apps using it and try again.';
  return 'The camera could not start. Try again or enter the barcode.';
}

export default function BarcodeScannerModal({ open, onClose, onScan, onManualEntry, continuous, feedback }: BarcodeScannerModalProps) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const activeTrack = useRef<MediaStreamTrack | null>(null);
  const callback = useRef(onScan);
  callback.current = onScan;

  const [state, setState] = useState<'STARTING' | 'RUNNING' | 'ERROR'>('STARTING');
  const [error, setError] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [lastAccepted, setLastAccepted] = useState('');

  useEffect(() => {
    if (!open) {
      setLastAccepted('');
      return;
    }
    if (!video) return;
    const preview = video;
    let active = true;
    let stream: MediaStream | undefined;
    let controls: IScannerControls | undefined;
    const accept = createCameraScanGate();
    let finished = false;

    function stop() {
      controls?.stop();
      controls = undefined;
      stream?.getTracks().forEach(track => track.stop());
      if (preview.srcObject === stream) preview.srcObject = null;
      if (activeTrack.current && stream?.getVideoTracks().includes(activeTrack.current)) activeTrack.current = null;
      stream = undefined;
    }

    async function start() {
      setState('STARTING');
      setError('');
      setTorchOn(false);
      setTorchAvailable(false);
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('ERROR');
        setError('Camera scanning needs a secure browser page with camera support. You can enter a barcode instead.');
        return;
      }

      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (!active) return;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (!active) { stop(); return; }
        const track = stream.getVideoTracks()[0];
        if (!track) throw new Error('No video track');
        activeTrack.current = track;
        track.addEventListener('ended', () => {
          if (!active) return;
          stop();
          setTorchAvailable(false);
          setState('ERROR');
          setError('The camera stopped. Try again or enter the barcode.');
        }, { once: true });

        preview.srcObject = stream;
        const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanSuccess: 150, delayBetweenScanAttempts: 100 });
        controls = await reader.decodeFromVideoElement(preview, result => {
          if (!active || finished || !result) return;
          const value = normalizeScannedBarcode(result.getText());
          if (!value || !accept(value, performance.now())) return;
          if (!continuous) finished = true;
          setLastAccepted(value);
          callback.current(value);
        });
        if (!active || finished) { stop(); return; }
        setState('RUNNING');
        const caps = track.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        setTorchAvailable(caps?.torch === true);
        const available = await navigator.mediaDevices.enumerateDevices?.().catch(() => []) ?? [];
        if (active) setDevices(available.filter(device => device.kind === 'videoinput' && device.deviceId));
      } catch (problem) {
        stop();
        if (!active) return;
        setState('ERROR');
        setError(cameraError(problem));
      }
    }

    void start();
    return () => { active = false; stop(); };
  }, [open, video, deviceId, attempt, continuous]);

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

  return <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
    <DialogContent className="z-[300] max-h-[90dvh] w-11/12 max-w-lg overflow-y-auto rounded-2xl">
      <DialogHeader>
        <DialogTitle>Scan barcode</DialogTitle>
        <DialogDescription>{continuous ? 'Move the label away and back to scan the same item again.' : 'Scan the label to fill the barcode field.'}</DialogDescription>
      </DialogHeader>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
        <video ref={setVideo} className="h-full w-full object-contain" playsInline muted />
        {state === 'RUNNING'
          ? <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="h-[40%] w-[80%] rounded-lg border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.25)]" />
          </div>
          : <div role={state === 'ERROR' ? 'alert' : 'status'} className="absolute inset-0 grid place-content-center justify-items-center gap-3 px-4 text-center text-sm font-medium text-white">
            {state === 'STARTING' ? <RefreshCw className="animate-spin" /> : <AlertTriangle className="text-amber-300" />}
            {state === 'STARTING' ? 'Starting camera…' : error}
          </div>}
      </div>
      {lastAccepted && <div role="status" className="rounded-xl border px-3 py-2 text-sm">
        <div className="flex items-center gap-2 break-all font-mono"><ScanLine size={16} className="shrink-0" /> {lastAccepted}</div>
        {feedback &&
          <p className={`mt-1 ${feedback.kind === 'ok' ? 'text-emerald-600' : 'text-amber-700 dark:text-amber-300'}`}>{feedback.text}</p>}
      </div>}
      <div className="flex flex-wrap gap-2">
        {devices.length > 1 && <select aria-label="Camera" value={deviceId} onChange={event => setDeviceId(event.target.value)} className="min-w-0 max-w-full rounded-lg border bg-background p-2 text-sm">
          <option value="">Automatic camera</option>
          {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
        </select>}
        {torchAvailable && <button type="button" aria-pressed={torchOn} onClick={() => void toggleTorch()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          {torchOn ? <ZapOff size={16} /> : <Zap size={16} />} {torchOn ? 'Torch off' : 'Torch on'}
        </button>}
        {state === 'ERROR' && <button type="button" onClick={() => setAttempt(value => value + 1)} className="rounded-lg border px-3 py-2 text-sm">Retry camera</button>}
        <button type="button" onClick={onManualEntry} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <Keyboard size={16} /> Enter barcode
        </button>
      </div>
    </DialogContent>
  </Dialog>;
}
