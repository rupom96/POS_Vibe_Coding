import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react';
import { getAppBaseUrl } from '../../../../config/runtimeConfig';
import { ocrTextToSearchTerms, recognizeTextFromVideo, startCameraPreview, stopCameraPreview } from '../../utils/scanOcr';
import { matchProductFromVideo } from '../../utils/productScanMatch';
import {
  SCAN_MODE_OPTIONS,
  formatsForMode,
  parseScanMode,
  statusHintForMode,
  usesCodeScanner,
  usesVisionCycle,
  type ScanMode,
} from '../../utils/scanModes';

const SCAN_REGION_ID = 'pos-scan-region';
const VISION_INTERVAL_MS = 4000;

export function ScanModal({
  open,
  sessionId,
  relayReady,
  remoteFrame,
  remoteLive,
  onClose,
  onScanTerm,
  registerRemoteScanHandler,
}: {
  open: boolean;
  sessionId: string;
  relayReady: boolean;
  remoteFrame: string | null;
  remoteLive: boolean;
  onClose: () => void;
  onScanTerm: (term: string) => Promise<boolean>;
  registerRemoteScanHandler: (handler: ((text: string) => void) | null) => void;
}) {
  const [manual, setManual] = useState('');
  const [scanMode, setScanMode] = useState<ScanMode>('all');
  const [status, setStatus] = useState(statusHintForMode('all'));
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const busyRef = useRef(false);
  const scanModeRef = useRef<ScanMode>('all');

  scanModeRef.current = scanMode;

  const remoteUrl = useMemo(() => {
    if (!sessionId) return '';
    const base = getAppBaseUrl();
    return `${base}/remote-scan/${sessionId}?mode=${scanMode}`;
  }, [sessionId, scanMode]);

  const tryProductScan = useCallback(async (): Promise<boolean> => {
    setStatus('Matching product photo…');
    try {
      const match = await matchProductFromVideo(SCAN_REGION_ID);
      if (!match) return false;
      setStatus(`Product scan: ${match.name}`);
      return await onScanTerm(match.name);
    } catch {
      return false;
    }
  }, [onScanTerm]);

  const tryOcrSearch = useCallback(async (): Promise<boolean> => {
    setStatus('Reading label with OCR…');
    try {
      const text = await recognizeTextFromVideo(SCAN_REGION_ID);
      const terms = ocrTextToSearchTerms(text);
      if (terms.length === 0) return false;

      for (const term of terms) {
        setStatus(`OCR search: ${term}`);
        const found = await onScanTerm(term);
        if (found) {
          setStatus(`Found via OCR: ${term}`);
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }, [onScanTerm]);

  const runVisionCycle = useCallback(async (mode: ScanMode): Promise<boolean> => {
    if (mode === 'text' || mode === 'all') {
      const ocrFound = await tryOcrSearch();
      if (ocrFound) return true;
      if (mode === 'text') return false;
    }

    if (mode === 'product' || mode === 'all') {
      return tryProductScan();
    }

    return false;
  }, [tryOcrSearch, tryProductScan]);

  const runVisionFallback = useCallback(async (): Promise<boolean> => {
    setStatus('No code match — trying text recognition…');
    const ocrFound = await tryOcrSearch();
    if (ocrFound) return true;

    setStatus('Trying product image scan…');
    return tryProductScan();
  }, [tryOcrSearch, tryProductScan]);

  const processScan = useCallback(async (term: string, source: 'scan' | 'manual' | 'remote' = 'scan') => {
    const trimmed = term.trim();
    if (!trimmed || busyRef.current) return;

    busyRef.current = true;
    setStatus(source === 'manual' ? `Searching: ${trimmed}` : `Scanned: ${trimmed}`);

    try {
      const found = await onScanTerm(trimmed);
      if (found) {
        onClose();
        return;
      }

      if (source === 'manual' || source === 'remote') {
        setStatus(`No match for "${trimmed}"`);
        return;
      }

      const mode = scanModeRef.current;
      if (mode === 'all') {
        const visionFound = await runVisionFallback();
        if (visionFound) onClose();
        else setStatus(statusHintForMode(mode));
        return;
      }

      setStatus(`No match for "${trimmed}"`);
    } finally {
      busyRef.current = false;
    }
  }, [onClose, onScanTerm, runVisionFallback]);

  const stopCamera = useCallback(async () => {
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

  useEffect(() => {
    if (!open) {
      registerRemoteScanHandler(null);
      return;
    }

    registerRemoteScanHandler((text) => {
      void processScan(text, 'remote');
    });

    return () => registerRemoteScanHandler(null);
  }, [open, processScan, registerRemoteScanHandler]);

  useEffect(() => {
    if (!open || !usesVisionCycle(scanMode)) return;

    const tick = async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const found = await runVisionCycle(scanModeRef.current);
        if (found) onClose();
      } finally {
        busyRef.current = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), VISION_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [open, scanMode, onClose, runVisionCycle]);

  useEffect(() => {
    if (!open) {
      busyRef.current = false;
      setManual('');
      setScanMode('all');
      setStatus(statusHintForMode('all'));
      void stopCamera();
      return;
    }

    setStatus(statusHintForMode(scanMode));
    let cancelled = false;

    const start = async () => {
      if (!usesCodeScanner(scanMode)) {
        await stopCamera();
        const previewOk = await startCameraPreview(SCAN_REGION_ID);
        if (!previewOk && !cancelled) {
          setStatus('Camera unavailable — use manual entry');
        }
        return;
      }

      const formats = formatsForMode(scanMode);
      const scanner = new Html5Qrcode(SCAN_REGION_ID, { formatsToSupport: formats, verbose: false });
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 160, height: 160 } },
          (decoded) => void processScan(decoded, 'scan'),
          () => {},
        );
      } catch {
        setStatus('Camera unavailable — use remote scanner or manual entry');
      }
    };

    void start();

    return () => {
      cancelled = true;
      void stopCamera();
    };
  }, [open, processScan, scanMode, stopCamera]);

  if (!open) return null;

  return (
    <div className="mo active" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="md qr pos-scan-modal" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="mh">
          <span className="mhi">📷</span>
          <span className="mt">Scanner</span>
          <button type="button" className="mc" onClick={onClose}>✕</button>
        </div>

        <div className="mb" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto' }}>
          <div style={{ width: '100%' }}>
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

          <div className="pos-scan-feed-stack">
            <div className="pos-scan-feed-block">
              <div className="pos-scan-feed-label">
                <span className="pos-scan-feed-icon">🖥️</span>
                This device
              </div>
              <div id={SCAN_REGION_ID} className="pos-scan-region" />
            </div>

            <div className={`pos-scan-feed-block pos-scan-remote-feed${remoteLive ? ' live' : ''}`}>
              <div className="pos-scan-feed-label">
                <span className="pos-scan-feed-icon">📱</span>
                Phone scanner
                {remoteLive && <span className="pos-scan-live-pill">Live</span>}
              </div>
              <div className="pos-scan-remote-viewport">
                {remoteLive && remoteFrame ? (
                  <img src={remoteFrame} alt="Phone camera feed" className="pos-scan-remote-frame" />
                ) : (
                  <div className="pos-scan-remote-empty">
                    <span className="pos-scan-remote-empty-icon">📱</span>
                    <span>Phone not connected</span>
                    <span className="pos-scan-remote-empty-hint">Scan the QR below to link your phone</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>Scanning...</div>
            <div style={{ fontSize: 10, color: 'var(--text3)' }}>{status}</div>
          </div>

          {!remoteLive && (
            <div className="pos-scan-qr-row" style={{ width: '100%', borderTop: '1px dashed var(--border)' }}>
              <div className="mfll">Connect phone as remote scanner</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <QRCodeSVG value={remoteUrl} size={96} level="M" />
                <div style={{ fontSize: 10, color: 'var(--text2)', lineHeight: 1.45 }}>
                  Scan this QR from your phone (same Wi‑Fi, HTTPS for phone camera).
                  {relayReady ? (
                    <div style={{ marginTop: 4, color: 'var(--accent)' }}>Ready — waiting for phone…</div>
                  ) : (
                    <div style={{ marginTop: 4, color: 'var(--text3)' }}>Connecting relay…</div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{ width: '100%' }}>
            <div className="mfll">Or type / paste manually</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="mfi"
                placeholder="Enter search term..."
                style={{ flex: 1 }}
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void processScan(manual, 'manual')}
              />
              <button type="button" className="bp" style={{ padding: '0 12px', fontSize: 12 }} onClick={() => void processScan(manual, 'manual')}>
                Apply
              </button>
            </div>
          </div>
        </div>

        <div className="mf">
          <button type="button" className="bs" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
