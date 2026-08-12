/**
 * Pure helpers used by POS acceptance unit tests.
 * Keep UI/components calling the same logic where practical.
 */

/** Inv. discount (resolved amount) must not exceed Total bill. */
export function isInvoiceDiscountAllowed(discountAmount: number, totalBill: number): boolean {
  if (discountAmount < 0) return false;
  return discountAmount <= totalBill + 1e-9;
}

export function resolveInvoiceDiscountAmount(
  invoiceDiscount: number,
  invoiceDiscountType: 'Amount' | 'Percentage',
  totalBill: number,
): number {
  if (invoiceDiscountType === 'Percentage') return (totalBill * invoiceDiscount) / 100;
  return invoiceDiscount;
}

/** Soft-zero fields: empty/invalid/negative → 0 on blur. */
export function commitSoftZero(raw: string): number {
  const trimmed = raw.trim();
  const num = Number(trimmed);
  if (trimmed === '' || !Number.isFinite(num) || num < 0) return 0;
  return num;
}

/** Multi-scan autocomplete: auto-pick only when exactly one match. */
export function shouldAutoPickMultiScan(resultCount: number): boolean {
  return resultCount === 1;
}

/**
 * Unit-price edit patch must never include discount.
 * (Regression: typing price must not clamp/overwrite serial discount.)
 */
export function unitPriceEditPatch(unitPrice: number): { unitPrice: number } {
  return { unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0 };
}

/** Stock qty validation applies only to non-service products. */
export function exceedsStock(
  quantity: number,
  stockQty: number,
  productType?: string | null,
): boolean {
  const isService = (productType ?? '').trim().toUpperCase() === 'S';
  if (isService) return false;
  if (stockQty <= 0) return false;
  return quantity > stockQty;
}
