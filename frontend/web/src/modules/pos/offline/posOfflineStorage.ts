import { posSession } from '../../../config/posSession';
import { posDb, type HeldInvoiceRecord } from './posDb';
import {
  computeSnapshotGrandTotal,
  countFilledLines,
  formatHeldLabel,
  type PosDraftSnapshot,
} from './posSnapshot';

export function getPosSessionKey(): string {
  return `${posSession.companyId}-${posSession.locationId}-${posSession.employeeId}`;
}

export async function saveDraft(snapshot: PosDraftSnapshot): Promise<void> {
  const key = getPosSessionKey();
  await posDb.drafts.put({ key, snapshot, updatedAt: Date.now() });
}

export async function loadDraft(): Promise<PosDraftSnapshot | null> {
  const record = await posDb.drafts.get(getPosSessionKey());
  return record?.snapshot ?? null;
}

export async function clearDraft(): Promise<void> {
  await posDb.drafts.delete(getPosSessionKey());
}

export async function listHeldInvoices(): Promise<HeldInvoiceRecord[]> {
  return posDb.heldInvoices
    .where('sessionKey')
    .equals(getPosSessionKey())
    .reverse()
    .sortBy('heldAt');
}

export async function addHeldInvoice(snapshot: PosDraftSnapshot): Promise<HeldInvoiceRecord> {
  const heldAt = Date.now();
  const itemCount = countFilledLines(snapshot.lines);
  const grandTotal = computeSnapshotGrandTotal(snapshot);
  const record: HeldInvoiceRecord = {
    id: `hold-${heldAt}`,
    sessionKey: getPosSessionKey(),
    heldAt,
    customerName: snapshot.customerName.trim() || 'Walk-in Customer',
    itemCount,
    grandTotal,
    invoiceNo: snapshot.invoiceNo.trim() || formatHeldLabel(heldAt),
    snapshot,
  };
  await posDb.heldInvoices.put(record);
  return record;
}

export async function removeHeldInvoice(id: string): Promise<void> {
  await posDb.heldInvoices.delete(id);
}

export async function getHeldInvoice(id: string): Promise<HeldInvoiceRecord | undefined> {
  return posDb.heldInvoices.get(id);
}
