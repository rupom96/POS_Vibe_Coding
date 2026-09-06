import type { InvoiceLine, SerialEntry } from '../types';

export type SamePriceMatch = {
  line: InvoiceLine;
  /** 1-based row number among non-deleted lines. */
  rowNo: number;
};

/** Visible (non-deleted) lines that share productId + unitPrice. */
export function findSameProductPriceMatches(
  lines: InvoiceLine[],
  productId: number,
  unitPrice: number,
  /** Prefer this price for the blurred row (may not be dispatched yet). */
  override?: { lineId: string; unitPrice: number },
): SamePriceMatch[] {
  const price = Number(unitPrice);
  if (!productId || !Number.isFinite(price)) return [];

  const visible = lines.filter((l) => l.rowStatus !== 'deleted');
  const matches: SamePriceMatch[] = [];

  for (let i = 0; i < visible.length; i++) {
    const line = visible[i];
    if (line.productId !== productId) continue;
    const linePrice = override && line.id === override.lineId
      ? Number(override.unitPrice)
      : Number(line.unitPrice);
    if (!Number.isFinite(linePrice) || linePrice !== price) continue;
    matches.push({ line, rowNo: i + 1 });
  }

  return matches;
}

export type MergedSamePriceResult = {
  keepId: string;
  deleteIds: string[];
  quantity: number;
  serials: SerialEntry[];
  unitPrice: number;
};

/** Keep the first matching row; sum qty (and concat serials) from the rest. */
export function planSamePriceMerge(matches: SamePriceMatch[]): MergedSamePriceResult | null {
  if (matches.length < 2) return null;

  const keep = matches[0].line;
  const deleteIds = matches.slice(1).map((m) => m.line.id);
  const serials = matches.flatMap((m) => m.line.serials);
  const quantity = keep.isSerial
    ? serials.length
    : matches.reduce((sum, m) => sum + (Number(m.line.quantity) || 0), 0);

  return {
    keepId: keep.id,
    deleteIds,
    quantity,
    serials,
    unitPrice: Number(keep.unitPrice),
  };
}
