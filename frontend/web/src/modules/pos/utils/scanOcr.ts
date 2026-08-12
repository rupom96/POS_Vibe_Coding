import { createWorker, type Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

async function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng');
  }
  return workerPromise;
}

export function getScannerVideo(regionId: string): HTMLVideoElement | null {
  const region = document.getElementById(regionId);
  return region?.querySelector('video') ?? null;
}

let previewStream: MediaStream | null = null;

export async function stopCameraPreview(): Promise<void> {
  if (previewStream) {
    previewStream.getTracks().forEach((track) => track.stop());
    previewStream = null;
  }
}

export async function startCameraPreview(regionId: string): Promise<boolean> {
  const region = document.getElementById(regionId);
  if (!region) return false;

  await stopCameraPreview();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    previewStream = stream;

    region.innerHTML = '';
    const video = document.createElement('video');
    video.setAttribute('playsinline', 'true');
    video.style.width = '100%';
    video.style.display = 'block';
    video.srcObject = stream;
    region.appendChild(video);
    await video.play();
    return true;
  } catch {
    await stopCameraPreview();
    return false;
  }
}

export function ocrTextToSearchTerms(text: string): string[] {
  const cleaned = text.replace(/[^\w\s\-./#]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[^\w\s\-./#]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 2);

  const tokens = cleaned.split(' ').filter((token) => token.length >= 2);
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const term of [...lines, cleaned, ...tokens]) {
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(term);
  }

  return candidates.sort((a, b) => b.length - a.length).slice(0, 10);
}

export function captureVideoFrame(regionId: string): HTMLCanvasElement | null {
  const video = getScannerVideo(regionId);
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function recognizeTextFromVideo(regionId: string): Promise<string> {
  const canvas = captureVideoFrame(regionId);
  if (!canvas) return '';

  const worker = await getOcrWorker();
  const { data } = await worker.recognize(canvas);
  return data.text?.trim() ?? '';
}
