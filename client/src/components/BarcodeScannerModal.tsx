import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, ZapOff, AlertTriangle, RefreshCw, Keyboard } from 'lucide-react';
import { normalizeBarcode } from '../services/barcodeService';

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  /** Called once per accepted scan. The modal stays open for continuous scanning. */
  onScan: (barcode: string) => void;
  title?: string;
  /** Ignore an identical barcode for this many ms (accidental repeat protection). */
  debounceMs?: number;
}

type CameraState = 'IDLE' | 'STARTING' | 'RUNNING' | 'DENIED' | 'UNSUPPORTED' | 'ERROR';

const HINT_DEVICES: { label: string; facingMode: string }[] = [
  { label: 'Rear camera', facingMode: 'environment' },
  { label: 'Front camera', facingMode: 'user' },
];

/**
 * Camera barcode scanner.
 *
 * @zxing/browser is imported lazily so it never lands in the initial bundle —
 * hardware-scanner users (the retail counter case) pay nothing for it.
 */
const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  open,
  onClose,
  onScan,
  title = 'Scan barcode',
  debounceMs = 900,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });

  const [state, setState] = useState<CameraState>('IDLE');
  const [errorMsg, setErrorMsg] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [lastAccepted, setLastAccepted] = useState('');

  const stop = useCallback(() => {
    try {
      controlsRef.current?.stop?.();
    } catch {
      /* already stopped */
    }
    controlsRef.current = null;
  }, []);

  const start = useCallback(
    async (idx: number) => {
      if (!videoRef.current) return;
      stop();
      setState('STARTING');
      setErrorMsg('');
      setTorchOn(false);
      setTorchAvailable(false);

      try {
        const mod = await import('@zxing/browser');
        const reader = new mod.BrowserMultiFormatReader();
        const devices = await mod.BrowserCodeReader.listVideoInputDevices();

        // Prefer the rear camera on mobile: it is the one pointed at the label.
        let deviceId: string | undefined;
        if (devices.length > 1) {
          const wanted = HINT_DEVICES[idx % HINT_DEVICES.length];
          const preferred =
            devices.find(d => (d.label || '').toLowerCase().includes(wanted.facingMode === 'environment' ? 'back' : 'front')) ||
            devices.find(d => (d.label || '').toLowerCase().includes(wanted.facingMode === 'environment' ? 'rear' : 'user'));
          deviceId = (preferred || devices[devices.length - 1]).deviceId;
        } else {
          deviceId = devices[0]?.deviceId;
        }

        const controls = await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current,
          (result) => {
            if (!result) return;
            const value = normalizeBarcode(result.getText());
            if (!value) return;
            const now = Date.now();
            const last = lastScanRef.current;
            if (last.value === value && now - last.at < debounceMs) return; // repeat guard
            lastScanRef.current = { value, at: now };
            setLastAccepted(value);
            onScan(value);
          }
        );

        controlsRef.current = controls;
        setState('RUNNING');

        // Torch support is device dependent and only known after the track exists.
        try {
          const stream = (videoRef.current?.srcObject as MediaStream) || null;
          const track = stream?.getVideoTracks?.()[0];
          const caps = (track?.getCapabilities?.() || {}) as { torch?: boolean };
          setTorchAvailable(!!caps.torch);
        } catch {
          setTorchAvailable(false);
        }
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string };
        if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
          setState('DENIED');
          setErrorMsg('Camera permission nahi mili. USB scanner ya barcode manually enter karein.');
        } else if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') {
          setState('UNSUPPORTED');
          setErrorMsg('Is device par camera nahi mila. Hardware scanner/manual entry use karein.');
        } else if (e?.name === 'NotSupportedError' || typeof navigator === 'undefined' || !navigator.mediaDevices) {
          setState('UNSUPPORTED');
          setErrorMsg('Is browser me camera scan available nahi. Hardware scanner/manual entry use karein.');
        } else {
          setState('ERROR');
          setErrorMsg(e?.message || 'Camera start nahi ho paya.');
        }
      }
    },
    [debounceMs, onScan, stop]
  );

  useEffect(() => {
    if (!open) {
      stop();
      setState('IDLE');
      setLastAccepted('');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState('UNSUPPORTED');
      setErrorMsg('Is browser me camera scan available nahi. Hardware scanner/manual entry use karein.');
      return;
    }
    void start(deviceIndex);
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => stop(), [stop]);

  const toggleTorch = async () => {
    try {
      const next = !torchOn;
      await controlsRef.current?.switchTorch?.(next);
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            className="relative w-full sm:max-w-lg bg-surface rounded-t-[32px] sm:rounded-[32px] overflow-hidden border border-border shadow-google-lg"
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h3 className="text-lg font-black font-heading text-foreground">{title}</h3>
              <button
                onClick={onClose}
                aria-label="Close scanner"
                className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative mx-6 rounded-[24px] overflow-hidden bg-black aspect-[4/3]">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />

              {state === 'RUNNING' && (
                <>
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-[78%] h-[42%] border-2 border-white/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                  </div>
                  <div className="absolute bottom-3 left-0 right-0 text-center">
                    <span className="inline-block px-3 py-1.5 rounded-full bg-black/60 text-white text-[11px] font-bold">
                      Barcode ko frame ke andar rakhein
                    </span>
                  </div>
                </>
              )}

              {state !== 'RUNNING' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
                  {state === 'STARTING' ? (
                    <>
                      <RefreshCw className="w-8 h-8 text-white/80 animate-spin" />
                      <p className="text-white/90 text-sm font-bold">Camera start ho raha hai…</p>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-9 h-9 text-amber-400" />
                      <p className="text-white/90 text-sm font-bold leading-relaxed">
                        {errorMsg || 'Camera available nahi hai.'}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 pt-4 pb-6 space-y-3">
              {lastAccepted && (
                <div className="rounded-2xl bg-google-green/10 border border-google-green/20 px-4 py-2.5">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-google-green">Last scan</p>
                  <p className="text-sm font-bold text-foreground font-mono break-all">{lastAccepted}</p>
                </div>
              )}

              <div className="flex gap-3">
                {torchAvailable && (
                  <button
                    onClick={toggleTorch}
                    className="flex-1 py-3.5 rounded-full bg-surface-container-high font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                    {torchOn ? <ZapOff className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                    {torchOn ? 'Torch off' : 'Torch on'}
                  </button>
                )}
                <button
                  onClick={() => {
                    const next = deviceIndex + 1;
                    setDeviceIndex(next);
                    void start(next);
                  }}
                  className="flex-1 py-3.5 rounded-full bg-surface-container-high font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" /> Camera badlein
                </button>
              </div>

              <p className="text-[11px] font-bold text-muted-foreground flex items-start gap-2 leading-relaxed">
                <Keyboard className="w-4 h-4 mt-0.5 shrink-0" />
                Camera kaam na kare to USB/Bluetooth scanner se seedha scan karein — page ka barcode box
                hamesha sun raha hai.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default BarcodeScannerModal;
