import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useLazyGetBulkProductSerialsQuery } from '../../api/posApi';

import type { ProductSerialOption, SerialEntry, SerialModalResult } from '../../types';

import {

  roundDiscount,

  serialDiscountSum,

  splitTotalDiscount,

  toSerialEntry,

} from '../../utils/format';

import { SerialSearchInput } from './SerialSearchInput';



function mergeSerialRows(existing: SerialEntry[], incoming: SerialEntry[], maxTotal: number) {

  const have = new Set(existing.map((s) => s.serialNo.toLowerCase()));

  const merged = [...existing];

  for (const row of incoming) {

    if (merged.length >= maxTotal) break;

    if (!have.has(row.serialNo.toLowerCase())) {

      have.add(row.serialNo.toLowerCase());

      merged.push(row);

    }

  }

  return merged;

}



export function SerialModal({

  open,

  productId,

  productName,

  locationId,

  stockQty,

  initialSerials,

  initialWarrantyDays,

  initialQuantity,

  onClose,

  onConfirm,

  onToast,

}: {

  open: boolean;

  productId?: number;

  productName?: string;

  locationId: number;

  stockQty: number;

  initialSerials: SerialEntry[];

  initialWarrantyDays: number;

  initialQuantity: number;

  onClose: () => void;

  onConfirm: (result: SerialModalResult) => void;

  onToast: (message: string, icon?: string) => void;

}) {

  const [rows, setRows] = useState<SerialEntry[]>([]);

  const [bulkQty, setBulkQty] = useState(0);

  const [warrantyDays, setWarrantyDays] = useState(365);

  const [totalDiscountInput, setTotalDiscountInput] = useState('0');

  const scanRef = useRef<HTMLInputElement>(null);



  const [fetchBulk] = useLazyGetBulkProductSerialsQuery();



  const maxSerials = stockQty > 0 ? stockQty : Number.POSITIVE_INFINITY;



  useEffect(() => {

    if (!open) return;

    setRows(initialSerials.map((s) => ({ ...s })));

    setBulkQty(initialQuantity > 0 ? initialQuantity : initialSerials.length);

    setWarrantyDays(initialWarrantyDays || 365);

    setTotalDiscountInput(String(roundDiscount(serialDiscountSum(initialSerials)) || 0));

    window.setTimeout(() => scanRef.current?.focus(), 200);

  }, [open, initialSerials, initialQuantity, initialWarrantyDays]);



  useEffect(() => {

    setTotalDiscountInput(String(roundDiscount(serialDiscountSum(rows)) || 0));

  }, [rows]);



  const exclude = useMemo(() => rows.map((r) => r.serialNo), [rows]);

  const slotsLeft = Math.max(0, maxSerials - rows.length);



  const addFromOptions = useCallback((options: ProductSerialOption[]) => {

    if (!options.length) return;

    setRows((prev) => {

      const room = Math.max(0, maxSerials - prev.length);

      if (room <= 0) {

        onToast(`Cannot add more than ${maxSerials} serial(s) (stock limit)`, '⚠');

        return prev;

      }

      const limited = options.slice(0, room);

      if (limited.length < options.length) {

        onToast(`Only ${room} serial slot(s) left (stock limit)`, '⚠');

      }

      return mergeSerialRows(prev, limited.map(toSerialEntry), maxSerials);

    });

  }, [maxSerials, onToast]);



  const removeRow = useCallback((index: number) => {

    setRows((prev) => prev.filter((_, i) => i !== index));

  }, []);



  const updateRowDiscount = useCallback((index: number, discount: number) => {

    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, discount } : r)));

  }, []);



  const revertRowDiscount = useCallback((index: number) => {

    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, discount: r.dbDiscount } : r)));

  }, []);



  const revertAllDiscounts = useCallback(() => {

    setRows((prev) => prev.map((r) => ({ ...r, discount: r.dbDiscount })));

    onToast('Discounts reverted to database values', '↩');

  }, [onToast]);



  const applyTotalDiscount = useCallback(() => {

    if (!rows.length) {

      onToast('Add serials first', '⚠');

      return;

    }

    const total = Number(totalDiscountInput) || 0;

    const split = splitTotalDiscount(total, rows.length);

    setRows((prev) => prev.map((r, i) => ({ ...r, discount: split[i] ?? 0 })));

    onToast('Discount split across serials', '✓');

  }, [onToast, rows.length, totalDiscountInput]);



  const handleBulkAdd = useCallback(async () => {

    if (!productId || bulkQty <= 0) {

      onToast('Enter bulk quantity', '⚠');

      return;

    }

    const room = Math.max(0, maxSerials - rows.length);

    if (room <= 0) {

      onToast(`Cannot add more than ${maxSerials} serial(s) (stock limit)`, '⚠');

      return;

    }

    const count = Math.min(bulkQty, room);

    try {

      const result = await fetchBulk({

        productId,

        locationId,

        count,

        exclude,

      }).unwrap();

      if (!result.length) {

        onToast('No serials available in stock', '⚠');

        return;

      }

      setRows((prev) => mergeSerialRows(prev, result.map(toSerialEntry), maxSerials));

      if (count < bulkQty) {

        onToast(`Added ${result.length} serial(s) (stock limit ${maxSerials})`, '🔢');

      } else {

        onToast(`${result.length} serial(s) loaded`, '🔢');

      }

    } catch {

      onToast('Failed to load serials', '⚠');

    }

  }, [bulkQty, exclude, fetchBulk, locationId, maxSerials, onToast, productId, rows.length]);



  const handleConfirm = useCallback(() => {

    if (stockQty > 0 && rows.length > stockQty) {

      onToast(`Cannot exceed stock (${stockQty} available)`, '⚠');

      return;

    }

    const quantity = rows.length > 0 ? rows.length : bulkQty;

    onConfirm({

      serials: rows,

      warrantyDays,

      quantity,

      lineDiscount: serialDiscountSum(rows),

    });

    onToast(`Serials saved ✓ (${rows.length} items)`, '🔢');

  }, [bulkQty, onConfirm, onToast, rows, stockQty, warrantyDays]);



  if (!open || !productId) return null;



  return (

    <div className="mo active" onClick={(e) => e.target === e.currentTarget && onClose()}>

      <div className="md wide" onClick={(e) => e.stopPropagation()}>

        <div className="mh">

          <span className="mhi">🔢</span>

          <span className="mt">Serial Management{productName ? ` — ${productName}` : ''}</span>

          {stockQty > 0 && (

            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text3)' }}>

              Stock: {stockQty} · {slotsLeft} slot{slotsLeft === 1 ? '' : 's'} left

            </span>

          )}

          <button type="button" className="mc" onClick={onClose}>✕</button>

        </div>



        <div className="mb">

          <div className="mr2" style={{ marginBottom: 10 }}>

            <div className="mfl">

              <div className="mfll">Bulk Quantity</div>

              <div style={{ display: 'flex', gap: 5 }}>

                <input

                  className="mfi"

                  type="number"

                  min={0}

                  max={slotsLeft > 0 ? slotsLeft : 0}

                  value={bulkQty || ''}

                  onChange={(e) => setBulkQty(Number(e.target.value) || 0)}

                  style={{ flex: 1 }}

                />

                <input

                  className="mfi"

                  type="text"

                  value="Pcs"

                  readOnly

                  tabIndex={-1}

                  style={{

                    width: 68,

                    cursor: 'default',

                    color: 'var(--text3)',

                    background: 'var(--surface3)',

                    textAlign: 'center',

                    fontWeight: 600,

                  }}

                />

              </div>

              <button

                type="button"

                className="bp"

                style={{ marginTop: 6, width: '100%', padding: '6px 12px', fontSize: 12 }}

                onClick={() => void handleBulkAdd()}

              >

                Add

              </button>

            </div>

            <div className="mfl">

              <div className="mfll">Warranty (Days)</div>

              <input

                className="mfi"

                type="number"

                min={0}

                value={warrantyDays || ''}

                onChange={(e) => setWarrantyDays(Number(e.target.value) || 0)}

              />

            </div>

          </div>



          <div className="mfl">

            <div className="mfll">Total Discount</div>

            <div style={{ display: 'flex', gap: 6 }}>

              <input

                className="mfi mono"

                type="number"

                step="0.01"

                value={totalDiscountInput}

                placeholder="0"

                title="Enter total discount, then Apply to split evenly per serial"

                onChange={(e) => setTotalDiscountInput(e.target.value)}

                style={{ flex: 1 }}

              />

              <button type="button" className="bp" style={{ padding: '0 14px', fontSize: 12 }} onClick={applyTotalDiscount}>

                Apply

              </button>

            </div>

          </div>



          <div className="mfl">

            <div className="mfll">Scan / Input Serial</div>

            <div style={{ display: 'flex', gap: 6 }}>

              <SerialSearchInput

                productId={productId}

                locationId={locationId}

                exclude={exclude}

                maxAddable={slotsLeft}

                inputRef={scanRef}

                onAdd={addFromOptions}

                onStockLimit={() => onToast(`Cannot exceed stock (${stockQty} available)`, '⚠')}

              />

            </div>

          </div>



          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.5px' }}>

            Serial List

          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', maxHeight: 160, overflowY: 'auto' }}>

            <table className="stbl" id="stbl">

              <thead>

                <tr>

                  <th>#</th>

                  <th>Serial No</th>

                  <th>

                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>

                      Discount

                      <button type="button" className="serial-undo-btn" title="Revert all discounts" onClick={revertAllDiscounts}>

                        ↩

                      </button>

                    </span>

                  </th>

                  <th>Del</th>

                </tr>

              </thead>

              <tbody>

                {rows.map((row, index) => (

                  <tr key={`${row.serialNo}-${index}`}>

                    <td>{index + 1}</td>

                    <td><span className="stag">{row.serialNo}</span></td>

                    <td>

                      <div className="serial-disc-cell">

                        <input

                          className="mfi mono serial-disc-inp"

                          type="number"

                          value={row.discount || ''}

                          onChange={(e) => updateRowDiscount(index, Number(e.target.value) || 0)}

                        />

                        <button

                          type="button"

                          className="serial-undo-btn"

                          title="Revert to database discount"

                          onClick={() => revertRowDiscount(index)}

                        >

                          ↩

                        </button>

                      </div>

                    </td>

                    <td>

                      <button type="button" className="del-btn" onClick={() => removeRow(index)}>✕</button>

                    </td>

                  </tr>

                ))}

                {!rows.length && (

                  <tr>

                    <td colSpan={4} style={{ color: 'var(--text3)', textAlign: 'center' }}>No serials added</td>

                  </tr>

                )}

              </tbody>

            </table>

          </div>

        </div>



        <div className="mf">

          <button type="button" className="bs" onClick={onClose}>Cancel</button>

          <button type="button" className="bp" onClick={handleConfirm}>Confirm Serials</button>

        </div>

      </div>

    </div>

  );

}


