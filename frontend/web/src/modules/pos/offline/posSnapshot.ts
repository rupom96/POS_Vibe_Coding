import type { PosFormState } from '../store/posSlice';
import type { InvoiceLine } from '../types';
import { calcLineTotal } from '../utils/format';

export type PosDraftSnapshot = Omit<PosFormState, 'sidebarOpen'>;

export function toSnapshot(state: PosFormState): PosDraftSnapshot {
  const { sidebarOpen: _sidebar, ...snapshot } = state;
  return {
    ...snapshot,
    lines: state.lines.map((line) => ({ ...line, serials: line.serials.map((s) => ({ ...s })) })),
  };
}

export function hasSnapshotContent(snapshot: PosDraftSnapshot): boolean {
  if (snapshot.customerName.trim() || snapshot.mobile.trim() || snapshot.invoiceNo.trim()) return true;
  if (snapshot.buyerId || snapshot.salesOrderId) return true;
  if (snapshot.givenAmount > 0 || snapshot.invoiceDiscount > 0 || snapshot.vatAit > 0 || snapshot.othersCharge > 0) {
    return true;
  }
  return snapshot.lines.some((line) => line.rowStatus !== 'deleted' && line.productName.trim());
}

export function countFilledLines(lines: InvoiceLine[]): number {
  return lines.filter((line) => line.rowStatus !== 'deleted' && line.productName.trim()).length;
}

export function computeSnapshotGrandTotal(snapshot: PosDraftSnapshot): number {
  let totalAmt = 0;
  snapshot.lines.forEach((line) => {
    if (!line.productName.trim() || line.rowStatus === 'deleted') return;
    totalAmt += calcLineTotal(line.quantity, line.unitPrice, line.discount, line.vatPercent, line.taxPercent);
  });
  const discountAmount = snapshot.invoiceDiscountType === 'Percentage'
    ? (totalAmt * snapshot.invoiceDiscount) / 100
    : snapshot.invoiceDiscount;
  return totalAmt - discountAmount + snapshot.vatAit + snapshot.othersCharge;
}

export function formatHeldLabel(heldAt: number): string {
  return `HLD-${new Date(heldAt).toISOString().slice(0, 10).replace(/-/g, '')}-${String(heldAt).slice(-4)}`;
}

export function formatHeldMeta(heldAt: number, itemCount: number): string {
  const when = new Date(heldAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${when} · ${itemCount} item${itemCount === 1 ? '' : 's'}`;
}
