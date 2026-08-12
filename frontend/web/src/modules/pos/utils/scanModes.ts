import { Html5QrcodeSupportedFormats } from 'html5-qrcode';

export type ScanMode = 'all' | 'qr' | 'bar' | 'text' | 'product';

export const SCAN_MODE_OPTIONS: { value: ScanMode; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'qr', label: 'QR' },
  { value: 'bar', label: 'Bar' },
  { value: 'text', label: 'Text Recognition' },
  { value: 'product', label: 'Product Image Scan' },
];

const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
];

export function parseScanMode(value: string | null | undefined): ScanMode {
  if (value === 'qr' || value === 'bar' || value === 'text' || value === 'product' || value === 'all') {
    return value;
  }
  return 'all';
}

export function usesCodeScanner(mode: ScanMode): boolean {
  return mode === 'all' || mode === 'qr' || mode === 'bar';
}

export function usesVisionCycle(mode: ScanMode): boolean {
  return mode === 'all' || mode === 'text' || mode === 'product';
}

export function formatsForMode(mode: ScanMode): Html5QrcodeSupportedFormats[] {
  if (mode === 'qr') return [Html5QrcodeSupportedFormats.QR_CODE];
  if (mode === 'bar') return BARCODE_FORMATS;
  if (mode === 'all') return [Html5QrcodeSupportedFormats.QR_CODE, ...BARCODE_FORMATS];
  return [];
}

export function statusHintForMode(mode: ScanMode): string {
  switch (mode) {
    case 'qr':
      return 'Point camera at QR code';
    case 'bar':
      return 'Point camera at barcode';
    case 'text':
      return 'Point camera at product label text';
    case 'product':
      return 'Point camera at product image';
    default:
      return 'Point camera at barcode, QR code, or product';
  }
}
