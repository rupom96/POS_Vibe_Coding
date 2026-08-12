import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { connectRemoteRelay, type RemoteRelay } from '../modules/pos/utils/scanRelay';
import { ocrTextToSearchTerms, recognizeTextFromVideo, startCameraPreview, stopCameraPreview } from '../modules/pos/utils/scanOcr';
import { matchProductFromVideo } from '../modules/pos/utils/productScanMatch';
import { startPreviewStream } from '../modules/pos/utils/remotePreview';
import {
  SCAN_MODE_OPTIONS,
  formatsForMode,
  parseScanMode,
  statusHintForMode,
  usesCodeScanner,
  usesVisionCycle,
  type ScanMode,
} from '../modules/pos/utils/scanModes';
import '../modules/pos/styles/pos.css';

const SCAN_REGION_ID = 'remote-scan-region';
const VISION_INTERVAL_MS = 4000;

export function RemoteScanPage() {
  const { sessionId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const [scanMode, setScanMode] = useState<ScanMode>(() => parseScanMode(searchParams.get('mode')));
  const [status, setStatus] = useState(statusHintForMode('all'));
  const [manual, setManual] = useState('');
  const [scanArmed, setScanArmed] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const relayRef = useRef<RemoteRelay | null>(null);
  const stopStreamRef = useRef<(() => void) | null>(null);
  const busyRef = useRef(false);
  const scanModeRef = useRef<ScanMode>('all');
  const scanArmedRef = useRef(false);

  scanModeRef.current = scanMode;
  scanArmedRef.current = scanArmed;

  const sendScan = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !sessionId || busyRef.current || !scanArmedRef.current) return;
    if (trimmed.includes('/remote-scan/')) return;

    const relay = relayRef.current;
    if (!relay) {
      setStatus('Not linked to POS — re-scan the QR');
      return;
    }

    busyRef.current = true;
    setStatus(`Sent: ${trimmed}`);
    try {
      await relay.sendScan(trimmed);
      setManual('');
    } catch {
      setStatus('Failed to send to POS — check PC is open and on same Wi‑Fi');
    } finally {
      window.setTimeout(() => {
        busyRef.current = false;
        setStatus(scanArmedRef.current ? statusHintForMode(scanModeRef.current) : 'Send to POS is off');
      }, 800);
    }
  }, [sessionId]);

  const tryOcr = useCallback(async (): Promise<boolean> => {
    if (!scanArmedRef.current) return false;
    setStatus('Reading label with OCR…');
    try {
      const text = await recognizeTextFromVideo(SCAN_REGION_ID);
      const terms = ocrTextToSearchTerms(text);
      if (terms.length === 0) return false;
      for (const term of terms) {
        await sendScan(term);
        await new Promise((r) => window.setTimeout(r, 900));
      }
      return true;
    } catch {
      return false;
    }
  }, [sendScan]);

  const tryProductScan = useCallback(async (): Promise<boolean> => {
    if (!scanArmedRef.current) return false;
    setStatus('Matching product photo…');
    try {
      const match = await matchProductFromVideo(SCAN_REGION_ID);
      if (!match) return false;
      await sendScan(match.name);
      return true;
    } catch {
      return false;
    }
  }, [sendScan]);

  const runVisionCycle = useCallback(async (mode: ScanMode) => {
    if (!scanArmedRef.current) return;
    if (mode === 'text' || mode === 'all') {
      const ocrSent = await tryOcr();
      if (ocrSent || mode === 'text') return;
    }
    if (mode === 'product' || mode === 'all') {
      await tryProductScan();
    }
  }, [tryOcr, tryProductScan]);

  const stopCamera = useCallback(async () => {
    stopStreamRef.current?.();
    stopStreamRef.current = null;

    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop();
      } catch {
        /* ignore */
      }
      try {
        scanner.clear();
      } catch {
        /* ignore */
      }
    }
    await stopCameraPreview();
  }, []);

  const startPreviewToPos = useCallback(() => {
    stopStreamRef.current?.();
    const relay = relayRef.current;
    if (!relay) return;

    stopStreamRef.current = startPreviewStream(SCAN_REGION_ID, (frame) => {
      void relay.sendPreviewFrame(frame).catch(() => {});
    });
  }, []);

  const setArmed = useCallback((armed: boolean) => {
    scanArmedRef.current = armed;
    setScanArmed(armed);
    setStatus(armed ? statusHintForMode(scanModeRef.current) : 'Send to POS is off — turn on to scan');
  }, []);

  useEffect(() => {
    setScanMode(parseScanMode(searchParams.get('mode')));
  }, [searchParams]);

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    const connect = async () => {
      try {
        const relay = await connectRemoteRelay(sessionId);
        if (cancelled) {
          await relay.connection.stop();
          return;
        }
        relayRef.current = relay;
        relay.onArmState((armed) => setArmed(armed));
        setStatus('Linked to POS — waiting for POS to enable sending');
      } catch {
        if (!cancelled) setStatus('Could not reach POS — check Wi‑Fi and re-scan QR');
      }
    };

    void connect();

    return () => {
      cancelled = true;
      void relayRef.current?.connection.stop();
      relayRef.current = null;
    };
  }, [sessionId, setArmed]);

  useEffect(() => {
    if (!sessionId || !usesVisionCycle(scanMode)) return;

    const tick = async () => {
      if (busyRef.current || !scanArmedRef.current) return;
      busyRef.current = true;
      try {
        await runVisionCycle(scanModeRef.current);
      } finally {
        busyRef.current = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), VISION_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [sessionId, scanMode, runVisionCycle]);

  useEffect(() => {
    if (!sessionId) {
      setStatus('Invalid session — scan the QR again from POS');
      return;
    }

    if (!window.isSecureContext) {
      setStatus('Camera needs HTTPS on your phone. Re-scan the QR from POS, or type the code below.');
      return;
    }

    setStatus(scanArmed ? statusHintForMode(scanMode) : 'Send to POS is off — turn on to scan');
    let cancelled = false;

    const start = async () => {
      await stopCamera();
      if (cancelled) return;

      if (!usesCodeScanner(scanMode)) {
        const previewOk = await startCameraPreview(SCAN_REGION_ID);
        if (!previewOk && !cancelled) {
          setStatus('Camera blocked — allow camera permission, or type below');
          return;
        }
        if (!cancelled) startPreviewToPos();
        return;
      }

      const scanner = new Html5Qrcode(SCAN_REGION_ID, {
        formatsToSupport: formatsForMode(scanMode),
        verbose: false,
      });
      scannerRef.current = scanner;

      setStatus('Starting camera…');
      await new Promise((r) => window.setTimeout(r, 300));
      if (cancelled) return;

      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => void sendScan(decoded),
          () => {},
        );
        if (!cancelled) {
          setStatus(scanArmedRef.current ? statusHintForMode(scanMode) : 'Send to POS is off — turn on to scan');
          startPreviewToPos();
        }
      } catch {
        if (!cancelled) setStatus('Camera blocked — allow camera permission, or type below');
      }
    };

    void start();

    return () => {
      cancelled = true;
      void stopCamera();
    };
  }, [scanArmed, scanMode, sendScan, sessionId, startPreviewToPos, stopCamera]);

  return (
    <div className="remote-scan-page">
      <div className="remote-scan-card">
        <h1>DataBiz Remote Scanner</h1>
        <p className="remote-scan-sub">Session linked to POS</p>

        <div className={`remote-scan-arm${scanArmed ? ' is-on' : ''}`}>
          <div className="remote-scan-arm-label">
            <span className="remote-scan-arm-title">Send to POS</span>
            <span className="remote-scan-arm-hint">
              {scanArmed
                ? 'Scans are sent to the POS screen'
                : 'Turn on to scan into POS or the active product row'}
            </span>
          </div>
          <button
            type="button"
            className={`remote-scan-arm-toggle${scanArmed ? ' on' : ''}`}
            aria-pressed={scanArmed}
            aria-label={scanArmed ? 'Stop sending scans to POS' : 'Start sending scans to POS'}
            onClick={() => setArmed(!scanArmed)}
          />
        </div>

        <div style={{ marginBottom: 10, width: '100%' }}>
          <div className="mfll">Scan mode</div>
          <select
            className="mfi"
            value={scanMode}
            onChange={(e) => setScanMode(parseScanMode(e.target.value))}
          >
            {SCAN_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div id={SCAN_REGION_ID} className="pos-scan-region" />
        <p className="remote-scan-status">{status}</p>

        <div className="remote-scan-manual">
          <input
            className="mfi"
            placeholder="Type or paste here..."
            value={manual}
            autoComplete="off"
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void sendScan(manual)}
          />
          <button type="button" className="bp" disabled={!scanArmed} onClick={() => void sendScan(manual)}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
