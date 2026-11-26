import { normalizeScannedBarcode } from './barcodeService';

const STARTUP_TIMEOUT = 10_000;
const STALL_TIMEOUT = 4_000;
const SCAN_INTERVAL = 80;

type CameraOptions = {
  deviceId: string;
  paused: () => boolean;
  onFrame: (code: string | null) => void;
  onReady: (track: MediaStreamTrack) => void;
  onDevices: (devices: MediaDeviceInfo[]) => void;
  onError: (message: string, recoverable: boolean) => void;
};

function cameraError(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was blocked. Allow camera access or enter the barcode.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No matching camera was found. Try another camera or enter the barcode.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'The camera is unavailable. Close other apps using it and try again.';
  return 'The camera could not start. Try again or enter the barcode.';
}

function isMiss(error: unknown) {
  if (typeof error !== 'object' || !error) return false;
  const decoderError = error as { name?: string; getKind?: () => string };
  const kind = decoderError.getKind?.() || decoderError.name;
  return kind === 'NotFoundException' || kind === 'ChecksumException' || kind === 'FormatException';
}

export function startBarcodeCamera(preview: HTMLVideoElement, options: CameraOptions) {
  let closed = false;
  let stream: MediaStream | undefined;
  let timer = 0;
  let watchdog = 0;
  let frameHandle: number | undefined;
  let videoFrames = 0;

  function stop() {
    if (closed) return;
    closed = true;
    window.clearTimeout(timer);
    window.clearTimeout(watchdog);
    if (frameHandle !== undefined) preview.cancelVideoFrameCallback?.(frameHandle);
    if (stream && preview.srcObject === stream) {
      preview.pause();
      preview.srcObject = null;
    }
    stream?.getTracks().forEach(track => track.stop());
  }

  function fail(message: string, recoverable = false) {
    if (closed) return;
    stop();
    options.onError(message, recoverable);
  }

  function onVideoFrame() {
    if (closed) return;
    videoFrames++;
    frameHandle = preview.requestVideoFrameCallback(onVideoFrame);
  }

  const media = navigator.mediaDevices;
  if (!media?.getUserMedia) {
    fail('Camera scanning needs a secure page with camera support. You can enter the barcode instead.');
    return stop;
  }

  async function start() {
    watchdog = window.setTimeout(() => {
      fail(stream ? 'The camera is open but no video is arriving. Try again.' : 'The camera did not respond. Check permissions and try again.', Boolean(stream));
    }, STARTUP_TIMEOUT);

    try {
      const mediaRequest = media.getUserMedia({
        audio: false,
        video: {
          ...(options.deviceId ? { deviceId: { exact: options.deviceId } } : { facingMode: { ideal: 'environment' } }),
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      }).then(opened => {
        if (closed) opened.getTracks().forEach(track => track.stop());
        else stream = opened;
        return opened;
      });
      const [opened, { BrowserMultiFormatReader }] = await Promise.all([mediaRequest, import('@zxing/browser')]);
      if (closed) return;
      const track = opened.getVideoTracks()[0];
      if (!track) throw new Error('No video track');

      track.addEventListener('ended', () => fail('The camera disconnected. Try again or enter the barcode.', true), { once: true });
      preview.srcObject = opened;
      if (typeof preview.requestVideoFrameCallback === 'function') {
        frameHandle = preview.requestVideoFrameCallback(onVideoFrame);
      }
      void preview.play().catch(() => {});

      const reader = new BrowserMultiFormatReader();
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Camera canvas is unavailable');
      let ready = false;
      let lastFrame = -1;
      let lastFrameAt = performance.now();
      let misses = 0;

      function scanFrame() {
        if (closed || !context) return;
        const now = performance.now();
        const frame = frameHandle !== undefined ? videoFrames : preview.currentTime;
        if (!track.muted && !preview.paused && preview.readyState >= 2 &&
            preview.videoWidth && preview.videoHeight && frame !== lastFrame && (frameHandle === undefined || frame > 0)) {
          lastFrame = frame;
          lastFrameAt = now;
          if (!ready) {
            ready = true;
            window.clearTimeout(watchdog);
            options.onReady(track);
          }

          if (!options.paused()) {
            // Use a smaller frame for normal scans, and periodically try full detail for small labels.
            const maxSide = misses >= 3 && misses % 4 === 3 ? 1280 : 960;
            const scale = Math.min(1, maxSide / Math.max(preview.videoWidth, preview.videoHeight));
            const width = Math.max(1, Math.round(preview.videoWidth * scale));
            const height = Math.max(1, Math.round(preview.videoHeight * scale));
            if (canvas.width !== width || canvas.height !== height) {
              canvas.width = width;
              canvas.height = height;
            }
            let code = '';
            try {
              context.drawImage(preview, 0, 0, width, height);
              code = normalizeScannedBarcode(reader.decodeFromCanvas(canvas).getText());
            } catch (error) {
              if (!isMiss(error)) {
                fail('The camera frame could not be read. Try again or enter the barcode.', true);
                return;
              }
            }
            misses = code ? 0 : misses + 1;
            options.onFrame(code || null);
          }
        } else if (ready && now - lastFrameAt >= STALL_TIMEOUT) {
          fail('The camera video stopped. Try again or enter the barcode.', true);
          return;
        }
        if (!closed) timer = window.setTimeout(scanFrame, SCAN_INTERVAL);
      }

      scanFrame();
      if (media.enumerateDevices) {
        void Promise.resolve().then(() => media.enumerateDevices()).then(devices => {
          if (!closed) options.onDevices(devices.filter(device => device.kind === 'videoinput' && device.deviceId));
        }).catch(() => {});
      }
    } catch (error) {
      fail(cameraError(error));
    }
  }

  void start();
  return stop;
}
