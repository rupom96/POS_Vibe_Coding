import { useCallback, useEffect, useMemo, useState } from 'react';
import { generateId } from '../../../../shared/utils/generateId';
import { formatCurrency, todayIso } from '../../utils/format';
import type { InvoiceLine } from '../../types';

type OrigItem = {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};

type NewExchangeItem = {
  id: string;
  productName: string;
  quantity: number;
  price: number;
};

function newExchangeRow(): NewExchangeItem {
  return { id: generateId(), productName: '', quantity: 1, price: 0 };
}

function mapPosLines(lines: InvoiceLine[]): OrigItem[] {
  return lines
    .filter((l) => l.rowStatus !== 'deleted' && l.productName.trim())
    .map((l) => ({
      id: l.id,
      productName: l.productName,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
    }));
}

const EXCHANGE_REASONS = [
  'Defective / Damaged',
  'Wrong Item Delivered',
  'Customer Changed Mind',
  'Size / Variant Mismatch',
  'Other',
] as const;

export function ExchangeModal({
  open,
  onClose,
  invoiceNo,
  customerName,
  invoiceDate,
  lines,
}: {
  open: boolean;
  onClose: () => void;
  invoiceNo: string;
  customerName: string;
  invoiceDate: string;
  lines: InvoiceLine[];
}) {
  const [origItems, setOrigItems] = useState<OrigItem[]>([]);
  const [showOrigItems, setShowOrigItems] = useState(false);
  const [returnIds, setReturnIds] = useState<Set<string>>(new Set());
  const [newItems, setNewItems] = useState<NewExchangeItem[]>([newExchangeRow()]);
  const [reason, setReason] = useState('');
  const [exchangeDate, setExchangeDate] = useState(todayIso());
  const [notes, setNotes] = useState('');

  const loadFromPosInvoice = useCallback(() => {
    const trimmed = invoiceNo.trim();
    if (!trimmed) {
      setOrigItems([]);
      setShowOrigItems(false);
      setReturnIds(new Set());
      return;
    }
    const items = mapPosLines(lines);
    setOrigItems(items);
    setShowOrigItems(items.length > 0);
    setReturnIds(new Set());
  }, [invoiceNo, lines]);

  useEffect(() => {
    if (!open) return;
    setNewItems([newExchangeRow()]);
    setReason('');
    setNotes('');
    setExchangeDate(todayIso());
    loadFromPosInvoice();
  }, [open, loadFromPosInvoice]);

  const toggleReturn = useCallback((id: string, checked: boolean) => {
    setReturnIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const returnValue = useMemo(() => {
    return origItems.reduce((sum, item) => {
      if (!returnIds.has(item.id)) return sum;
      return sum + item.quantity * item.unitPrice;
    }, 0);
  }, [origItems, returnIds]);

  const newItemsValue = useMemo(
    () => newItems.reduce((sum, item) => sum + (item.quantity || 0) * (item.price || 0), 0),
    [newItems],
  );

  const balance = newItemsValue - returnValue;
  const balanceColor = balance === 0 ? 'var(--accent)' : balance > 0 ? 'var(--blue)' : 'var(--red)';

  if (!open) return null;

  const displayInvoiceNo = invoiceNo.trim() || '—';

  return (
    <div className="mo active" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="md wide" style={{ maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="mh">
          <span className="mhi">🔁</span>
          <span className="mt">Exchange / Return</span>
          <button type="button" className="mc" onClick={onClose}>✕</button>
        </div>

        <div className="mb" style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: '14px 16px' }}>
          <div style={{ marginBottom: 14 }}>
            <div className="pos-step-title">
              <span className="pos-step-badge pos-step-badge--blue">1</span>
              Find Original Invoice
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="mfi mono"
                placeholder="Enter Invoice No (e.g. INV-DBZ-2025-000001)"
                style={{ flex: 1 }}
                value={displayInvoiceNo === '—' ? '' : displayInvoiceNo}
                readOnly
              />
              <button type="button" className="bp" style={{ padding: '0 14px', fontSize: 12 }} onClick={loadFromPosInvoice}>
                Search
              </button>
            </div>
            {showOrigItems && (
              <div style={{ marginTop: 8 }}>
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                      {displayInvoiceNo}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text2)' }}>{customerName || '—'}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>{invoiceDate || '—'}</span>
                  </div>
                  <table className="stbl">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Product</th>
                        <th style={{ textAlign: 'right' }}>Qty</th>
                        <th style={{ textAlign: 'right' }}>Price</th>
                        <th>Return?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {origItems.map((item, index) => (
                        <tr key={item.id}>
                          <td style={{ padding: '5px 9px' }}>{index + 1}</td>
                          <td style={{ padding: '5px 9px', fontWeight: 600 }}>{item.productName}</td>
                          <td style={{ padding: '5px 9px', textAlign: 'right' }}>{item.quantity}</td>
                          <td style={{ padding: '5px 9px', textAlign: 'right' }}>{formatCurrency(item.unitPrice)}</td>
                          <td style={{ padding: '5px 9px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={returnIds.has(item.id)}
                              onChange={(e) => toggleReturn(item.id, e.target.checked)}
                              style={{ accentColor: 'var(--red)', width: 13, height: 13, cursor: 'pointer' }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="pos-modal-divider" />

          <div style={{ marginBottom: 14 }}>
            <div className="pos-step-title">
              <span className="pos-step-badge pos-step-badge--orange">2</span>
              Exchange / New Items
            </div>
            {newItems.map((row, index) => (
              <div key={row.id} className="fr" style={{ marginBottom: 4 }}>
                <span className="fl" style={{ width: 28, fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
                  #{index + 1}
                </span>
                <input
                  className="fv"
                  placeholder="New product name..."
                  style={{ flex: 2 }}
                  value={row.productName}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewItems((items) => items.map((item) => (item.id === row.id ? { ...item, productName: value } : item)));
                  }}
                />
                <input
                  className="fv mono"
                  type="number"
                  placeholder="Qty"
                  style={{ width: 56, flex: 'none' }}
                  min={0}
                  value={row.quantity || ''}
                  onChange={(e) => {
                    const quantity = Number(e.target.value) || 0;
                    setNewItems((items) => items.map((item) => (item.id === row.id ? { ...item, quantity } : item)));
                  }}
                />
                <input
                  className="fv mono"
                  type="number"
                  placeholder="Price"
                  style={{ width: 82, flex: 'none' }}
                  min={0}
                  value={row.price || ''}
                  onChange={(e) => {
                    const price = Number(e.target.value) || 0;
                    setNewItems((items) => items.map((item) => (item.id === row.id ? { ...item, price } : item)));
                  }}
                />
                <button
                  type="button"
                  className="del-btn"
                  style={{ flexShrink: 0 }}
                  onClick={() => setNewItems((items) => (items.length > 1 ? items.filter((item) => item.id !== row.id) : items))}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn-ghost"
              style={{ marginTop: 6, padding: '4px 12px', fontSize: 11 }}
              onClick={() => setNewItems((items) => [...items, newExchangeRow()])}
            >
              + Add Item
            </button>
          </div>

          <div className="pos-modal-divider" />

          <div className="mr2" style={{ marginBottom: 10 }}>
            <div className="mfl" style={{ marginBottom: 0 }}>
              <div className="mfll">Exchange Reason</div>
              <select className="mfi" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">— Select —</option>
                {EXCHANGE_REASONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div className="mfl" style={{ marginBottom: 0 }}>
              <div className="mfll">Exchange Date</div>
              <input className="mfi" type="date" value={exchangeDate} onChange={(e) => setExchangeDate(e.target.value)} />
            </div>
          </div>
          <div className="mfl">
            <div className="mfll">Notes</div>
            <textarea
              className="cs-textarea"
              placeholder="Optional notes..."
              style={{ minHeight: 52 }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="ex-balance-bar">
            <div className="ex-balance-item">
              <div className="ex-balance-label">Return Value</div>
              <div className="ex-balance-val ex-balance-val--red">{formatCurrency(returnValue)}</div>
            </div>
            <div className="ex-balance-sep">↔</div>
            <div className="ex-balance-item">
              <div className="ex-balance-label">New Items Value</div>
              <div className="ex-balance-val ex-balance-val--blue">{formatCurrency(newItemsValue)}</div>
            </div>
            <div className="ex-balance-sep">=</div>
            <div className="ex-balance-item ex-balance-item--grow">
              <div className="ex-balance-label ex-balance-label--accent">Balance</div>
              <div className="ex-balance-val ex-balance-val--accent" style={{ color: balanceColor }}>
                {balance > 0 ? '+' : ''}{formatCurrency(balance)}
              </div>
            </div>
          </div>
        </div>

        <div className="mf">
          <button type="button" className="bs" onClick={onClose}>Cancel</button>
          <button type="button" className="bp" onClick={onClose}>✓ Confirm Exchange</button>
        </div>
      </div>
    </div>
  );
}
