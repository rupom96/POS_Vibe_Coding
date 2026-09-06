import type { InvoiceLine } from '../types';

export type IncompleteQtyPriceField = 'quantity' | 'unitPrice';

export type IncompleteQtyPrice = {
  line: InvoiceLine;
  rowNo: number;
  field: IncompleteQtyPriceField;
};

/** First product row (optionally only those above `beforeLineId`) missing qty or unit price. */
export function findIncompleteQtyOrPrice(
  lines: InvoiceLine[],
  opts?: { beforeLineId?: string },
): IncompleteQtyPrice | null {
  const visible = lines.filter((l) => l.rowStatus !== 'deleted');
  let stopAt = visible.length;
  if (opts?.beforeLineId) {
    const idx = visible.findIndex((l) => l.id === opts.beforeLineId);
    if (idx >= 0) stopAt = idx;
  }

  let rowNo = 0;
  for (let i = 0; i < stopAt; i++) {
    const line = visible[i];
    if (!line.productId) continue;
    rowNo += 1;
    if (!(Number(line.quantity) > 0)) {
      return { line, rowNo, field: 'quantity' };
    }
    if (!(Number(line.unitPrice) > 0)) {
      return { line, rowNo, field: 'unitPrice' };
    }
  }
  return null;
}

export function incompleteQtyPriceMessage(hit: IncompleteQtyPrice) {
  const name = hit.line.productName.trim() || 'this product';
  if (hit.field === 'quantity') {
    return `Fill up the quantity of product ${name} in row no ${hit.rowNo} first`;
  }
  return `Fill up the Unit price of product ${name} in row no ${hit.rowNo} first`;
}
