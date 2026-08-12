import type { HeldInvoiceRecord } from '../../offline/posDb';
import { formatCurrency } from '../../utils/format';
import { formatHeldMeta } from '../../offline/posSnapshot';

export function HoldInvoiceModal({
  open,
  onClose,
  items,
  loading,
  onHoldCurrent,
  onRestore,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  items: HeldInvoiceRecord[];
  loading?: boolean;
  onHoldCurrent: () => void;
  onRestore: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  if (!open) return null;

  return (
    <div className="mo active" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="md wide">
        <div className="mh">
          <span className="mhi">⏸️</span>
          <span className="mt">Hold Invoice — Offline List</span>
          <button type="button" className="mc" onClick={onClose}>✕</button>
        </div>
        <div className="mb">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 12 }}>
              Loading held invoices…
            </div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 12 }}>
              No held invoices yet
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="hold-item">
                <div>
                  <div className="hi-inv">{item.invoiceNo}</div>
                  <div className="hi-cust">{item.customerName}</div>
                  <div className="hi-meta">{formatHeldMeta(item.heldAt, item.itemCount)}</div>
                </div>
                <div className="hi-amt">{formatCurrency(item.grandTotal)}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="hr-btn" onClick={() => onRestore(item.id)}>
                    Restore
                  </button>
                  {onDelete ? (
                    <button type="button" className="bs" onClick={() => onDelete(item.id)}>
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
          <div style={{ textAlign: 'center', padding: '14px 0' }}>
            <button type="button" className="bp" onClick={onHoldCurrent}>
              ⏸ Hold Current Invoice
            </button>
          </div>
        </div>
        <div className="mf">
          <button type="button" className="bs" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
