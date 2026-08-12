import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { InvoiceSearchResult } from '../types';
import {
  acItemClass,
  handleAutocompleteKeyDown,
  useAutocompleteBrowseMode,
  useAutocompleteHighlight,
  useScrollHighlightedOption,
} from '../utils/autocompleteBrowse';
import { useAutocompleteMenu } from '../utils/useAutocompleteMenu';

export const InvoiceSearchInput = memo(function InvoiceSearchInput({
  value,
  options,
  onSelect,
  onClear,
  onSearch,
  onCommit,
}: {
  value: InvoiceSearchResult | null;
  options: InvoiceSearchResult[];
  onSelect: (invoice: InvoiceSearchResult) => void;
  onClear: () => void;
  onSearch?: (term: string) => void;
  onCommit?: (invoiceNo: string) => void;
}) {
  const [draft, setDraft] = useState(value?.invoiceNo ?? '');
  const [open, setOpen] = useState(false);
  const pickedRef = useRef(false);
  const { filterActive, beginBrowse, beginFilter } = useAutocompleteBrowseMode();
  const { inputRef, menuRef, wrapRef, menuStyle, updateMenuPosition, isOutside } = useAutocompleteMenu(open);

  useEffect(() => {
    setDraft(value?.invoiceNo ?? '');
  }, [value?.invoiceNo, value?.salesOrderId]);

  const filtered = useMemo(() => {
    if (!filterActive) return options;
    const term = draft.trim().toLowerCase();
    if (!term) return options;
    return options.filter((inv) =>
      inv.invoiceNo.toLowerCase().includes(term)
      || (inv.customerName?.toLowerCase().includes(term) ?? false));
  }, [draft, filterActive, options]);

  const { highlight, setHighlight, moveDown, moveUp } = useAutocompleteHighlight(open, filtered.length);
  useScrollHighlightedOption(menuRef, highlight, open);

  const pick = useCallback((invoice: InvoiceSearchResult) => {
    pickedRef.current = true;
    setDraft(invoice.invoiceNo);
    setOpen(false);
    setHighlight(-1);
    onSelect(invoice);
  }, [onSelect, setHighlight]);

  const handleBlur = useCallback(() => {
    window.setTimeout(() => {
      setOpen(false);
      if (!pickedRef.current) {
        const trimmed = draft.trim();
        if (!trimmed) {
          onClear();
        } else {
          const exact = options.find((inv) => inv.invoiceNo.toLowerCase() === trimmed.toLowerCase());
          if (exact) onSelect(exact);
          else if (onCommit) onCommit(trimmed);
          else setDraft(value?.invoiceNo ?? '');
        }
      }
      pickedRef.current = false;
    }, 120);
  }, [draft, onClear, onCommit, onSelect, options, value?.invoiceNo]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (isOutside(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [isOutside]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    handleAutocompleteKeyDown(e, {
      open,
      optionCount: filtered.length,
      highlight,
      moveDown,
      moveUp,
      setHighlight,
      openMenu: () => {
        beginBrowse();
        setOpen(true);
        updateMenuPosition();
        onSearch?.('');
      },
      onPickIndex: (index) => {
        const item = filtered[index];
        if (item) pick(item);
      },
      onEscape: () => {
        setOpen(false);
        setHighlight(-1);
      },
    });
  }, [beginBrowse, filtered, highlight, moveDown, moveUp, onSearch, open, pick, setHighlight, updateMenuPosition]);

  const menu = open && filtered.length > 0 ? (
    <ul ref={menuRef} className="cust-ac-list cust-ac-list--portal" role="listbox" style={menuStyle}>
      {filtered.map((inv, idx) => {
        const selected = value?.salesOrderId === inv.salesOrderId
          || (!!value?.invoiceNo && value.invoiceNo.toLowerCase() === inv.invoiceNo.toLowerCase())
          || highlight === idx;
        return (
          <li key={inv.salesOrderId}>
            <button
              type="button"
              data-ac-idx={idx}
              className={acItemClass(selected)}
              aria-selected={selected}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(idx)}
              onClick={() => pick(inv)}
            >
              <span className="cust-ac-name">{inv.invoiceNo}</span>
              <span className="cust-ac-meta">{inv.customerName || '—'}</span>
            </button>
          </li>
        );
      })}
    </ul>
  ) : null;

  return (
    <div className={`cust-ac-wrap${open ? ' is-open' : ''}`} ref={wrapRef}>
      <input
        ref={inputRef}
        className="fv mono acc"
        value={draft}
        autoComplete="off"
        placeholder="Search invoice..."
        onChange={(e) => {
          pickedRef.current = false;
          beginFilter();
          setDraft(e.target.value);
          setOpen(true);
          setHighlight(-1);
          updateMenuPosition();
          onSearch?.(e.target.value);
          if (!e.target.value.trim()) onClear();
        }}
        onFocus={() => {
          beginBrowse();
          setOpen(true);
          updateMenuPosition();
          onSearch?.('');
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {menu && createPortal(menu, document.body)}
    </div>
  );
});