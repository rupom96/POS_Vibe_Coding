import { generateId } from '../../../shared/utils/generateId';
import type { InvoiceLine, ProductSerialOption, SerialEntry } from '../types';

export const DEFAULT_EMPTY_ROWS = 10;
export const TABLE_PREFS_KEY = 'pos-items-table-prefs';

export const formatCurrency = (value: number) =>
  `৳ ${value.toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;

export const formatNumber = (value: number) =>
  value.toLocaleString('en-BD', { maximumFractionDigits: 2 });

export const todayIso = () => new Date().toISOString().split('T')[0];

export const calcLineTotal = (
  qty: number,
  price: number,
  disc: number,
  vat: number,
  tax = 0,
) => {
  // `disc` is per-unit discount; line discount = disc * qty.
  const subtotal = qty * price - disc * qty;
  return subtotal + (subtotal * vat) / 100 + (subtotal * tax) / 100;
};

/** Total line discount amount when grid discount is per unit. */
export const calcLineDiscountAmount = (qty: number, unitDiscount: number) =>
  (Number(qty) || 0) * (Number(unitDiscount) || 0);

export const newLineId = () => generateId();

export const emptyLine = (sortOrder = 0): InvoiceLine => ({
  id: newLineId(),
  rowStatus: 'new',
  productName: '',
  modelNo: '',
  stock: '—',
  stockQty: 0,
  productType: undefined,
  unit: '',
  quantity: 0,
  unitPrice: 0,
  discount: 0,
  warrantyDays: 0,
  vatPercent: 0,
  taxPercent: 0,
  isSerial: false,
  serials: [],
  sortOrder,
});

export const createEmptyLines = (count = DEFAULT_EMPTY_ROWS) =>
  Array.from({ length: count }, (_, i) => emptyLine(i));

export const isLineEmpty = (line: InvoiceLine) =>
  !line.productId && !line.productName.trim();

export const isLineFilled = (line: InvoiceLine) =>
  !!line.productId && !!line.productName.trim();

/** Service products (ProductType = S) have no stock tracking. */
export const isServiceProduct = (productType?: string | null) =>
  (productType ?? '').trim().toUpperCase() === 'S';

export const formatStockDisplay = (
  stockQty: number,
  unitName?: string | null,
  productType?: string | null,
) => {
  if (isServiceProduct(productType)) return '';
  return `${stockQty} ${unitName ?? 'Pcs'}`;
};
export const lineHasContent = (line: InvoiceLine) =>
  !!line.productName.trim() || !!line.productId;

export function toSerialEntry(option: ProductSerialOption): SerialEntry {
  const discount = option.discountAmount ?? 0;
  return { serialNo: option.serialNo, discount, dbDiscount: discount };
}

export function serialDiscountSum(serials: SerialEntry[]) {
  return serials.reduce((sum, s) => sum + (s.discount || 0), 0);
}

export function serialAverageDiscount(serials: SerialEntry[]) {
  if (!serials.length) return 0;
  return serialDiscountSum(serials) / serials.length;
}

export function roundDiscount(value: number) {
  return Math.round(value * 100) / 100;
}

/** Split a total discount evenly across serial rows (2 dp; remainder on last row). */
export function splitTotalDiscount(total: number, count: number): number[] {
  if (count <= 0) return [];
  const safeTotal = roundDiscount(total);
  if (count === 1) return [safeTotal];
  const per = Math.floor((safeTotal / count) * 100) / 100;
  const results = Array.from({ length: count }, () => per);
  const assignedExceptLast = per * (count - 1);
  results[count - 1] = roundDiscount(safeTotal - assignedExceptLast);
  return results;
}
