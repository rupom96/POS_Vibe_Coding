import type { MultiScanSearchItem } from '../../types';

const TYPE_LABELS: Record<string, string> = {
  customer: 'Customer',
  product: 'Product',
  invoice: 'Invoice',
  serial: 'Serial',
  salesPerson: 'Sales Person',
};

export function MultiScanPickModal({
  open,
  items,
  onClose,
  onPick,
}: {
  open: boolean;
  items: MultiScanSearchItem[];
  onClose: () => void;
  onPick: (item: MultiScanSearchItem) => void;
}) {
  if (!open) return null;

  return (
    <div className="mo active" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="md" style={{ width: 420, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="mh">
          <span className="mhi">🔍</span>
          <span className="mt">Multiple matches</span>
          <button type="button" className="mc" onClick={onClose}>✕</button>
        </div>
        <div className="mb" style={{ overflowY: 'auto', padding: '10px 12px' }}>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>
            Select the item you meant:
          </p>
          <ul className="ms-ac-list" style={{ position: 'static', maxHeight: 'none', boxShadow: 'none' }}>
            {items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  className="cust-ac-item ms-ac-item"
                  onClick={() => {
                    onPick(item);
                    onClose();
                  }}
                >
                  <span className="ms-ac-badge">{TYPE_LABELS[item.type] ?? item.type}</span>
                  <span className="ms-ac-body">
                    <span className="cust-ac-name">{item.label}</span>
                    {item.subLabel ? <span className="cust-ac-meta">{item.subLabel}</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="mf">
          <button type="button" className="bs" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
