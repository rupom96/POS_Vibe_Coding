import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ProductSearchInput, type ProductSearchInputHandle } from '../ProductSearchInput';
import type { InvoiceLine, ProductSearchResult } from '../../types';
import { calcLineTotal, formatNumber, isLineFilled, isServiceProduct } from '../../utils/format';
import {
  findIncompleteQtyOrPrice,
  type IncompleteQtyPrice,
  type IncompleteQtyPriceField,
} from '../../utils/incompleteQtyPrice';

function hasProduct(line: InvoiceLine) {
  return !!line.productId;
}

function rowStatusClass(status: InvoiceLine['rowStatus']) {
  if (status === 'new') return 'ug-row-new';
  if (status === 'modified') return 'ug-row-modified';
  if (status === 'deleted') return 'ug-row-deleted';
  return '';
}

type PendingFocus =
  | { kind: 'qty'; lineId: string }
  | { kind: 'product-after'; lineId: string }
  | null;

export type PosItemsTableHandle = {
  /** Focus first empty product cell (used after customer select). */
  focusFirstEmptyProduct: () => void;
  /** Scroll a row into view and focus qty or unit price. */
  focusLineField: (lineId: string, field: IncompleteQtyPriceField) => void;
  /** After a product is applied (tree/scan), scroll the row and focus qty. */
  focusAfterProductApplied: (lineId: string) => void;
};

export const PosItemsTable = memo(forwardRef<PosItemsTableHandle, {
  lines: InvoiceLine[];
  locationId: number;
  companyId: number;
  readOnly?: boolean;
  onLineChange: (id: string, patch: Partial<InvoiceLine>) => void;
  onMarkDeleted: (id: string) => void;
  onEnsureTrailingRow: () => void;
  onProductSelect: (lineId: string, product: ProductSearchResult) => void | Promise<void>;
  onProductNameCommit: (lineId: string, name: string) => void;
  onProductFocus?: (lineId: string) => void;
  onProductBlur?: (lineId: string) => void;
  onQuantityBlur?: (lineId: string) => void;
  onUnitPriceBlur?: (lineId: string) => void;
  onSelectProductFromTree: (lineId: string) => void;
  onRowHover: (lineId: string | null, rect?: DOMRect) => void;
  onOpenSerial: (lineId: string) => void;
  onClear: () => void;
  /** Focus the POS Save button (actual DOM focus). */
  onFocusSave?: () => void;
  /** When true, product search does not hide products already on other rows. */
  allowDuplicateProducts?: boolean;
  onIncompleteRequired?: (hit: IncompleteQtyPrice) => void;
}>(function PosItemsTable({
  lines,
  locationId,
  companyId,
  readOnly = false,
  onLineChange,
  onMarkDeleted,
  onEnsureTrailingRow,
  onProductSelect,
  onProductNameCommit,
  onProductFocus,
  onProductBlur,
  onQuantityBlur,
  onUnitPriceBlur,
  onSelectProductFromTree,
  onRowHover,
  onOpenSerial,
  onClear,
  onFocusSave,
  allowDuplicateProducts = false,
  onIncompleteRequired,
}, ref) {
  const itemCount = useMemo(() => lines.filter(isLineFilled).length, [lines]);
  const selectedProductIdsByLine = useMemo(() => {
    const map = new Map<string, number[]>();
    if (allowDuplicateProducts) {
      for (const line of lines) map.set(line.id, []);
      return map;
    }
    const selected = lines
      .filter((l) => l.rowStatus !== 'deleted' && l.productId)
      .map((l) => ({ id: l.id, productId: l.productId! }));

    for (const line of lines) {
      map.set(
        line.id,
        selected.filter((s) => s.id !== line.id).map((s) => s.productId),
      );
    }
    return map;
  }, [allowDuplicateProducts, lines]);

  const [contextMenu, setContextMenu] = useState<{ lineId: string; x: number; y: number } | null>(null);
  const productRefs = useRef(new Map<string, ProductSearchInputHandle | null>());
  const qtyRefs = useRef(new Map<string, HTMLInputElement | null>());
  const priceRefs = useRef(new Map<string, HTMLInputElement | null>());
  const pendingFocus = useRef<PendingFocus>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (!contextMenu) return;
    const onDoc = () => closeContextMenu();
    const onKey = (e: KeyboardEvent | globalThis.KeyboardEvent) => { if (e.key === 'Escape') closeContextMenu(); };
    window.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onDoc, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onDoc, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [closeContextMenu, contextMenu]);

  const visibleLines = useMemo(
    () => lines.filter((l) => l.rowStatus !== 'deleted'),
    [lines],
  );

  const setProductRef = useCallback((lineId: string, handle: ProductSearchInputHandle | null) => {
    if (handle) productRefs.current.set(lineId, handle);
    else productRefs.current.delete(lineId);
  }, []);

  const setQtyRef = useCallback((lineId: string, el: HTMLInputElement | null) => {
    if (el) qtyRefs.current.set(lineId, el);
    else qtyRefs.current.delete(lineId);
  }, []);

  const setPriceRef = useCallback((lineId: string, el: HTMLInputElement | null) => {
    if (el) priceRefs.current.set(lineId, el);
    else priceRefs.current.delete(lineId);
  }, []);

  const focusQty = useCallback((lineId: string) => {
    const tryFocus = () => {
      const qty = qtyRefs.current.get(lineId);
      if (qty && !qty.disabled) {
        qty.focus();
        qty.select();
        return true;
      }
      // Serial rows: quantity locked → go to unit price.
      const price = priceRefs.current.get(lineId);
      if (price && !price.disabled) {
        price.focus();
        price.select();
        return true;
      }
      return false;
    };
    if (tryFocus()) return;
    window.requestAnimationFrame(() => {
      if (tryFocus()) return;
      window.requestAnimationFrame(() => { tryFocus(); });
    });
  }, []);

  const focusUnitPrice = useCallback((lineId: string) => {
    const tryFocus = () => {
      const price = priceRefs.current.get(lineId);
      if (price && !price.disabled) {
        price.focus();
        price.select();
        return true;
      }
      return false;
    };
    if (tryFocus()) return;
    window.requestAnimationFrame(() => tryFocus());
  }, []);

  const focusProduct = useCallback((lineId: string) => {
    const tryFocus = () => {
      const handle = productRefs.current.get(lineId);
      if (handle) {
        handle.focus();
        return true;
      }
      return false;
    };
    if (tryFocus()) return;
    window.requestAnimationFrame(() => {
      if (tryFocus()) return;
      window.requestAnimationFrame(() => { tryFocus(); });
    });
  }, []);

  const scrollToLine = useCallback((lineId: string) => {
    const row = scrollRef.current?.querySelector<HTMLTableRowElement>(`tr[data-line-id="${lineId}"]`);
    row?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []);

  const focusLineField = useCallback((lineId: string, field: IncompleteQtyPriceField) => {
    scrollToLine(lineId);
    const line = visibleLines.find((l) => l.id === lineId);
    if (field === 'quantity') {
      if (line?.isSerial && !(Number(line.quantity) > 0)) {
        onOpenSerial(lineId);
      }
      focusQty(lineId);
      return;
    }
    focusUnitPrice(lineId);
  }, [focusQty, focusUnitPrice, onOpenSerial, scrollToLine, visibleLines]);

  const blockIncomplete = useCallback((hit: IncompleteQtyPrice) => {
    onIncompleteRequired?.(hit);
    window.requestAnimationFrame(() => focusLineField(hit.line.id, hit.field));
  }, [focusLineField, onIncompleteRequired]);

  const incompleteBefore = useCallback((lineId: string) => (
    findIncompleteQtyOrPrice(visibleLines, { beforeLineId: lineId })
  ), [visibleLines]);

  useImperativeHandle(ref, () => ({
    focusFirstEmptyProduct: () => {
      if (readOnly) return;
      const target =
        visibleLines.find((l) => !hasProduct(l))
        ?? visibleLines[0];
      if (!target) return;
      const hit = incompleteBefore(target.id);
      if (hit) {
        blockIncomplete(hit);
        return;
      }
      focusProduct(target.id);
    },
    focusLineField: (lineId, field) => {
      if (readOnly) return;
      focusLineField(lineId, field);
    },
    focusAfterProductApplied: (lineId) => {
      if (readOnly) return;
      pendingFocus.current = { kind: 'qty', lineId };
      scrollToLine(lineId);
      focusQty(lineId);
    },
  }), [blockIncomplete, focusLineField, focusProduct, focusQty, incompleteBefore, readOnly, scrollToLine, visibleLines]);

  // Resolve deferred focus after product apply / trailing row appears.
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending || readOnly) return;

    if (pending.kind === 'qty') {
      const line = visibleLines.find((l) => l.id === pending.lineId);
      if (!line?.productId) return;
      pendingFocus.current = null;
      scrollToLine(pending.lineId);
      focusQty(pending.lineId);
      return;
    }

    if (pending.kind === 'product-after') {
      const idx = visibleLines.findIndex((l) => l.id === pending.lineId);
      if (idx < 0) return;
      const next = visibleLines[idx + 1];
      if (!next) return;
      pendingFocus.current = null;
      focusProduct(next.id);
    }
  }, [visibleLines, focusQty, focusProduct, readOnly, scrollToLine]);

  const handleProductSelected = useCallback(async (lineId: string, product: ProductSearchResult) => {
    if (readOnly) return;
    const hit = incompleteBefore(lineId);
    if (hit) {
      blockIncomplete(hit);
      return;
    }
    pendingFocus.current = { kind: 'qty', lineId };
    try {
      await onProductSelect(lineId, product);
    } finally {
      onEnsureTrailingRow();
      scrollToLine(lineId);
    }
  }, [blockIncomplete, incompleteBefore, onEnsureTrailingRow, onProductSelect, readOnly, scrollToLine]);

  const handleQtyEnter = useCallback((lineId: string, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const qty = Number(e.currentTarget.value);
    if (!(qty > 0)) {
      const idx = visibleLines.findIndex((l) => l.id === lineId);
      const next = visibleLines[idx + 1];
      const hit = findIncompleteQtyOrPrice(
        visibleLines,
        next ? { beforeLineId: next.id } : undefined,
      );
      if (hit) {
        blockIncomplete(hit);
        return;
      }
    }
    focusUnitPrice(lineId);
  }, [blockIncomplete, focusUnitPrice, readOnly, visibleLines]);

  const handlePriceEnter = useCallback((lineId: string, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const idx = visibleLines.findIndex((l) => l.id === lineId);
    const next = visibleLines[idx + 1];
    const selfHit = findIncompleteQtyOrPrice(
      visibleLines,
      next ? { beforeLineId: next.id } : undefined,
    );
    if (selfHit) {
      blockIncomplete(selfHit);
      return;
    }
    pendingFocus.current = { kind: 'product-after', lineId };
    onEnsureTrailingRow();
    window.requestAnimationFrame(() => {
      const idx = visibleLines.findIndex((l) => l.id === lineId);
      const next = visibleLines[idx + 1];
      if (next) {
        pendingFocus.current = null;
        const beforeNext = findIncompleteQtyOrPrice(visibleLines, { beforeLineId: next.id });
        if (beforeNext) {
          blockIncomplete(beforeNext);
          return;
        }
        focusProduct(next.id);
      }
    });
  }, [blockIncomplete, focusProduct, onEnsureTrailingRow, readOnly, visibleLines]);

  const handleEmptyProductEnter = useCallback((lineId: string) => {
    if (readOnly) return;
    const hit = incompleteBefore(lineId);
    if (hit) {
      blockIncomplete(hit);
      return;
    }
    onFocusSave?.();
  }, [blockIncomplete, incompleteBefore, onFocusSave, readOnly]);

  return (
    <div className="ugrid">
      <div className="ug-header">
        <span className="ug-dot" />
        Invoice Items
        <span className="ug-hint">
          · Enter: Product → Qty → Unit Price → next Product · Empty Product Enter → Save ·{' '}
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Alt+S</span> = Save
        </span>
        <span className="ug-count" style={{ marginLeft: 'auto' }}>
          {itemCount} item{itemCount === 1 ? '' : 's'}
        </span>
        <button type="button" className="btn-ghost" onClick={onClear} style={{ padding: '2px 9px', fontSize: 10.5, borderRadius: 5, flexShrink: 0 }}>
          Clear All
        </button>
      </div>

      <div ref={scrollRef} className="ug-scroll">
        <table className="ug-tbl">
          <thead>
            <tr>
              <th className="ug-th" style={{ width: 30 }}>#</th>
              <th className="ug-th" style={{ minWidth: 240 }}>Product / Barcode</th>
              <th className="ug-th" style={{ minWidth: 64 }}>Model</th>
              <th className="ug-th" style={{ minWidth: 56 }}>Stock</th>
              <th className="ug-th" style={{ minWidth: 48 }}>Unit</th>
              <th className="ug-th" style={{ minWidth: 42 }}>Qty</th>
              <th className="ug-th" style={{ minWidth: 68 }}>Unit Price (Tk)</th>
              <th className="ug-th" style={{ minWidth: 58 }}>Disc/Unit (Tk)</th>
              <th className="ug-th" style={{ minWidth: 52 }}>Wty (Days)</th>
              <th className="ug-th" style={{ minWidth: 40 }}>VAT %</th>
              <th className="ug-th" style={{ minWidth: 40 }}>Tax %</th>
              <th className="ug-th" style={{ minWidth: 72 }}>Total (Tk)</th>
              <th className="ug-th" style={{ width: 34 }} />
            </tr>
          </thead>
          <tbody>
            {visibleLines.map((line, index) => {
              const disabled = readOnly;
              const filled = hasProduct(line);
              const sl = filled
                ? visibleLines.slice(0, index + 1).filter((l) => hasProduct(l)).length
                : null;
              const total = filled
                ? calcLineTotal(line.quantity, line.unitPrice, line.discount, line.vatPercent, line.taxPercent)
                : null;

              return (
                <tr
                  key={line.id}
                  data-line-id={line.id}
                  className={`ug-tr ${rowStatusClass(line.rowStatus)}${filled ? '' : ' ug-tr-empty'}`}
                  onMouseEnter={(e) => filled && line.productId && onRowHover(line.id, e.currentTarget.getBoundingClientRect())}
                  onMouseLeave={() => onRowHover(null)}
                  onMouseDown={(e) => {
                    if (readOnly || filled) return;
                    const hit = incompleteBefore(line.id);
                    if (!hit) return;
                    e.preventDefault();
                    blockIncomplete(hit);
                  }}
                >
                  <td className="ug-td ug-td-sl">{sl ?? ''}</td>
                  <td
                    className="ug-td ug-td-prod"
                    onContextMenu={(e) => {
                      if (readOnly) return;
                      e.preventDefault();
                      setContextMenu({ lineId: line.id, x: e.clientX, y: e.clientY });
                    }}
                  >
                    <div className="ug-prod-wrap">
                      <div className="ug-prod-row">
                        <ProductSearchInput
                          ref={(handle) => setProductRef(line.id, handle)}
                          value={line.productName}
                          lineId={line.id}
                          locationId={locationId}
                          companyId={companyId}
                          excludeProductIds={selectedProductIdsByLine.get(line.id)}
                          selectedProductId={line.productId}
                          disabled={disabled}
                          onFocus={() => {
                            if (!filled && !readOnly) {
                              const hit = incompleteBefore(line.id);
                              if (hit) {
                                blockIncomplete(hit);
                                return;
                              }
                            }
                            onProductFocus?.(line.id);
                          }}
                          onBlur={() => onProductBlur?.(line.id)}
                          onNameCommit={(name) => {
                            if (readOnly) return;
                            onProductNameCommit(line.id, name);
                            onEnsureTrailingRow();
                          }}
                          onSelect={(product) => {
                            void handleProductSelected(line.id, product);
                          }}
                          onEmptyEnter={() => handleEmptyProductEnter(line.id)}
                          onEnterWithSelection={() => focusQty(line.id)}
                        />
                        {filled && line.isSerial && (
                          <button
                            type="button"
                            className="serial-badge"
                            disabled={readOnly}
                            onClick={() => {
                              if (readOnly) return;
                              onOpenSerial(line.id);
                            }}
                          >
                            🔢 Serial
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="ug-td">
                    {filled ? <input className="ug-inp" value={line.modelNo} readOnly /> : null}
                  </td>
                  <td className="ug-td ug-td-stock">
                    {filled ? (
                      <span className={`ug-stock${line.stock && line.stock !== '—' ? '' : ' ug-stock-empty'}`}>
                        {line.stock || '—'}
                      </span>
                    ) : null}
                  </td>
                  <td className="ug-td">
                    {filled ? <input className="ug-inp" value={line.unit} readOnly /> : null}
                  </td>
                  <td className="ug-td">
                    {filled ? (
                      <input
                        ref={(el) => setQtyRef(line.id, el)}
                        className="ug-inp ug-mono"
                        type="number"
                        min={0}
                        max={!isServiceProduct(line.productType) && line.stockQty > 0 ? line.stockQty : undefined}
                        disabled={disabled || line.isSerial}
                        title={
                          line.isSerial
                            ? 'Quantity is set from serials'
                            : !isServiceProduct(line.productType) && line.stockQty > 0
                              ? `Max ${line.stockQty}`
                              : undefined
                        }
                        value={line.quantity || ''}
                        onChange={(e) => onLineChange(line.id, { quantity: Number(e.target.value) || 0 })}
                        onBlur={() => onQuantityBlur?.(line.id)}
                        onKeyDown={(e) => handleQtyEnter(line.id, e)}
                      />
                    ) : null}
                  </td>
                  <td className="ug-td">
                    {filled ? (
                      <input
                        ref={(el) => setPriceRef(line.id, el)}
                        className="ug-inp ug-mono"
                        type="number"
                        min={0}
                        disabled={disabled}
                        title={
                          line.unitPriceMin != null && line.unitPriceMax != null
                            ? `Allowed range ${formatNumber(line.unitPriceMin)} – ${formatNumber(line.unitPriceMax)}`
                            : undefined
                        }
                        value={line.unitPrice || ''}
                        onChange={(e) => {
                          const up = Number(e.target.value) || 0;
                          onLineChange(line.id, { unitPrice: up });
                        }}
                        onBlur={() => onUnitPriceBlur?.(line.id)}
                        onKeyDown={(e) => handlePriceEnter(line.id, e)}
                      />
                    ) : null}
                  </td>
                  <td className="ug-td">
                    {filled ? (
                      <input
                        className="ug-inp ug-mono"
                        type="number"
                        min={0}
                        max={line.unitPrice > 0 ? line.unitPrice : undefined}
                        disabled={disabled}
                        title={`Discount cannot exceed unit price (${formatNumber(line.unitPrice)})`}
                        value={line.discount || ''}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 0;
                          onLineChange(line.id, { discount: v > line.unitPrice ? line.unitPrice : v });
                        }}
                      />
                    ) : null}
                  </td>
                  <td className="ug-td">
                    {filled ? (
                      <input
                        className="ug-inp ug-mono"
                        type="number"
                        min={0}
                        disabled={disabled}
                        value={line.warrantyDays || ''}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          onLineChange(line.id, {
                            warrantyDays: Number.isFinite(v) && v >= 0 ? v : 0,
                          });
                        }}
                      />
                    ) : null}
                  </td>
                  <td className="ug-td">
                    {filled ? (
                      <input
                        className="ug-inp ug-mono ug-vat-inp"
                        type="number"
                        min={0}
                        disabled={disabled}
                        value={line.vatPercent || ''}
                        onChange={(e) => onLineChange(line.id, { vatPercent: Number(e.target.value) || 0 })}
                      />
                    ) : null}
                  </td>
                  <td className="ug-td">
                    {filled ? (
                      <input
                        className="ug-inp ug-mono ug-vat-inp"
                        type="number"
                        min={0}
                        disabled={disabled}
                        value={line.taxPercent || ''}
                        onChange={(e) => onLineChange(line.id, { taxPercent: Number(e.target.value) || 0 })}
                      />
                    ) : null}
                  </td>
                  <td className="ug-td ug-td-total">
                    {filled ? (
                      <span className={`ug-total${total === null ? ' empty' : ''}`}>
                        {total === null ? '—' : formatNumber(total)}
                      </span>
                    ) : null}
                  </td>
                  <td className="ug-td ug-td-del">
                    {filled && !readOnly ? (
                      <button type="button" className="del-btn" onClick={() => onMarkDeleted(line.id)}>✕</button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {contextMenu && createPortal(
        <ul
          className="cust-ac-list ug-context-menu"
          style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 10000, minWidth: 180 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <li>
            <button
              type="button"
              className="cust-ac-item"
              onClick={() => {
                onSelectProductFromTree(contextMenu.lineId);
                closeContextMenu();
              }}
            >
              <span className="cust-ac-name">Select from tree</span>
            </button>
          </li>
        </ul>,
        document.body,
      )}
    </div>
  );
}));
