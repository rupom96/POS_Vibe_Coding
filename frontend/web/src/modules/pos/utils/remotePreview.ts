import { getScannerVideo } from './scanOcr';

const MAX_WIDTH = 240;
const JPEG_QUALITY = 0.5;
const STREAM_INTERVAL_MS = 300;

export function capturePreviewFrame(regionId: string): string | null {
  const video = getScannerVideo(regionId);
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }

  const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

export function startPreviewStream(
  regionId: string,
  onFrame: (dataUrl: string) => void,
): () => void {
  let active = true;

  const tick = () => {
    if (!active) return;
    const frame = capturePreviewFrame(regionId);
    if (frame) onFrame(frame);
  };

  tick();
  const timer = window.setInterval(tick, STREAM_INTERVAL_MS);
  return () => {
    active = false;
    window.clearInterval(timer);
  };
}

export const REMOTE_FEED_TIMEOUT_MS = 2500;
