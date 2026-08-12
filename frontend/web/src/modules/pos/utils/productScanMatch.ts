import { captureVideoFrame } from './scanOcr';

export interface ProductScanEntry {
  file: string;
  name: string;
}

export interface ProductScanMatch {
  name: string;
  file: string;
  score: number;
}

interface CatalogEntry extends ProductScanEntry {
  aHash: string;
  dHash: string;
}

const MATCH_MAX_DISTANCE = 22;

function catalogBaseUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}product-scan`.replace(/\/{2,}/g, '/').replace(':/', '://');
}

let catalogPromise: Promise<CatalogEntry[]> | null = null;

function hamming(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let distance = 0;
  for (let i = 0; i < len; i += 1) {
    if (a[i] !== b[i]) distance += 1;
  }
  return distance + Math.abs(a.length - b.length);
}

function toGray(data: Uint8ClampedArray, index: number): number {
  const offset = index * 4;
  return 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
}

function computeHashes(source: CanvasImageSource, width: number, height: number): { aHash: string; dHash: string } {
  const canvas = document.createElement('canvas');
  canvas.width = 9;
  canvas.height = 8;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { aHash: '', dHash: '' };

  ctx.drawImage(source, 0, 0, width, height, 0, 0, 9, 8);
  const { data } = ctx.getImageData(0, 0, 9, 8);

  const gray: number[] = [];
  for (let i = 0; i < 72; i += 1) {
    gray.push(toGray(data, i));
  }

  const avg = gray.reduce((sum, value) => sum + value, 0) / gray.length;
  let aHash = '';
  for (const value of gray) {
    aHash += value >= avg ? '1' : '0';
  }

  let dHash = '';
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const left = gray[row * 9 + col];
      const right = gray[row * 9 + col + 1];
      dHash += left > right ? '1' : '0';
    }
  }

  return { aHash, dHash };
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

function nameFromFile(file: string): string {
  const base = file.replace(/^.*[/\\]/, '');
  return base.replace(/\.[^.]+$/, '');
}

type ManifestImage = string | { file: string; name?: string };

function normalizeEntry(item: ManifestImage): ProductScanEntry | null {
  if (typeof item === 'string') {
    const file = item.trim();
    if (!file) return null;
    return { file, name: nameFromFile(file) };
  }

  const file = item.file?.trim();
  if (!file) return null;
  return { file, name: item.name?.trim() || nameFromFile(file) };
}

async function loadCatalog(): Promise<CatalogEntry[]> {
  const manifestUrl = `${catalogBaseUrl()}/manifest.json`;
  const response = await fetch(manifestUrl, { cache: 'no-store' });
  if (!response.ok) return [];

  const manifest = (await response.json()) as { images?: ManifestImage[] };
  const images = manifest.images ?? [];
  const entries: CatalogEntry[] = [];

  for (const image of images) {
    const entry = normalizeEntry(image);
    if (!entry) continue;
    try {
      const url = `${catalogBaseUrl()}/${entry.file.replace(/^\/+/, '')}`;
      const img = await loadImage(url);
      const hashes = computeHashes(img, img.naturalWidth, img.naturalHeight);
      if (!hashes.aHash || !hashes.dHash) continue;
      entries.push({ ...entry, ...hashes });
    } catch {
      /* skip broken catalog image */
    }
  }

  return entries;
}

async function getCatalog(): Promise<CatalogEntry[]> {
  if (!catalogPromise) {
    catalogPromise = loadCatalog();
  }
  return catalogPromise;
}

export function resetProductScanCatalog(): void {
  catalogPromise = null;
}

export async function matchProductFromVideo(regionId: string): Promise<ProductScanMatch | null> {
  const catalog = await getCatalog();
  if (catalog.length === 0) return null;

  const frame = captureVideoFrame(regionId);
  if (!frame) return null;

  const hashes = computeHashes(frame, frame.width, frame.height);
  if (!hashes.aHash || !hashes.dHash) return null;

  let best: ProductScanMatch | null = null;

  for (const entry of catalog) {
    const distance = hamming(hashes.aHash, entry.aHash) + hamming(hashes.dHash, entry.dHash);
    if (!best || distance < best.score) {
      best = { name: entry.name, file: entry.file, score: distance };
    }
  }

  if (!best || best.score > MATCH_MAX_DISTANCE) return null;
  return best;
}
