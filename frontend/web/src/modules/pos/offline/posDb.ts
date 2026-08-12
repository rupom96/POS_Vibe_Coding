import Dexie, { type Table } from 'dexie';
import type { PosDraftSnapshot } from './posSnapshot';

export interface PosDraftRecord {
  key: string;
  snapshot: PosDraftSnapshot;
  updatedAt: number;
}

export interface HeldInvoiceRecord {
  id: string;
  sessionKey: string;
  heldAt: number;
  customerName: string;
  itemCount: number;
  grandTotal: number;
  invoiceNo: string;
  snapshot: PosDraftSnapshot;
}

class PosOfflineDatabase extends Dexie {
  drafts!: Table<PosDraftRecord, string>;
  heldInvoices!: Table<HeldInvoiceRecord, string>;

  constructor() {
    super('DataBizPosOffline');
    this.version(1).stores({
      drafts: 'key',
      heldInvoices: 'id, sessionKey, heldAt',
    });
  }
}

export const posDb = new PosOfflineDatabase();
