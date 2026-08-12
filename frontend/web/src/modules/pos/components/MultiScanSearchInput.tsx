import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLazySearchMultiScanQuery } from '../api/posApi';
import type { MultiScanSearchItem } from '../types';
import {
  handleAutocompleteKeyDown,
  useAutocompleteHighlight,
  useScrollHighlightedOption,
} from '../utils/autocompleteBrowse';
import { useDebouncedCallback } from '../utils/debounce';
import { useAutocompleteMenu } from '../utils/useAutocompleteMenu';

const TYPE_LABELS: Record<string, string> = {
  customer: 'Customer',
  product: 'Product',
  invoice: 'Invoice',
  serial: 'Serial',
  salesPerson: 'Sales Person',
};

const TYPE_CLASS: Record<string, string> = {
  customer: 'ms-ac-badge--customer',
  product: 'ms-ac-badge--product',
  invoice: 'ms-ac-badge--invoice',
  serial: 'ms-ac-badge--serial',
  salesPerson: 'ms-ac-badge--sales',
};

export const MultiScanSearchInput = memo(function MultiScanSearchInput({
  companyId,
  locationId,
  disabled = false,
  onPick,
  onOpenScanner,
}: {
  companyId: number;
  locationId: number;
  disabled?: boolean;
  onPick: (item: MultiScanSearchItem) => void;
  onOpenScanner: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<MultiScanSearchItem[]>([]);
  const [searchMultiScan] = useLazySearchMultiScanQuery();
  const reqId = useRef(0);
  const pickedRef = useRef(false);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const { inputRef, menuRef, wrapRef, menuStyle, updateMenuPosition, isOutside } = useAutocompleteMenu(open);
  const { highlight, setHighlight, moveDown, moveUp } = useAutocompleteHighlight(open, options.length);
  useScrollHighlightedOption(menuRef, highlight, open);

  const pick = useCallback((item: MultiScanSearchItem) => {
    pickedRef.current = true;
    setDraft('');
    setOpen(false);
    setOptions([]);
    setHighlight(-1);
    onPickRef.current(item);
  }, [setHighlight]);

  const loadOptions = useCallback(async (term: string, autoPickSingle = false) => {
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      setOptions([]);
      return [] as MultiScanSearchItem[];
    }
    const id = ++reqId.current;
    try {
      const result = await searchMultiScan({
        q: trimmed,
        companyId: companyId > 0 ? companyId : undefined,
        locationId: locationId > 0 ? locationId : undefined,
        limit: 25,
      }).unwrap();
      if (id !== reqId.current) return result;

      setOptions(result);
      // Scanner / search: single match → load immediately (no manual select).
      if (autoPickSingle && result.length === 1) {
        pick(result[0]);
      }
      return result;
    } catch {
      if (id === reqId.current) setOptions([]);
      return [] as MultiScanSearchItem[];
    }
  }, [companyId, locationId, pick, searchMultiScan]);

  const runSearch = useDebouncedCallback(
    (term: string) => {
      void loadOptions(term, true);
    },
    300,
  );

  const handleBlur = useCallback(() => {
    window.setTimeout(() => {
      setOpen(false);
      if (!pickedRef.current && draft.trim().length >= 2 && options.length === 1) {
        pick(options[0]);
      } else if (!pickedRef.current) {
        setDraft('');
      }
      pickedRef.current = false;
    }, 120);
  }, [draft, options, pick]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (isOutside(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [isOutside]);

  const showMenu = open && !disabled && draft.trim().length >= 2;

  const menu = showMenu ? (
    <ul ref={menuRef} className="cust-ac-list cust-ac-list--portal ms-ac-list" role="listbox" style={menuStyle}>
      {options.length === 0 ? (
        <li className="ms-ac-empty">No matches</li>
      ) : (
        options.map((item, idx) => (
          <li key={item.key}>
            <button
              type="button"
              data-ac-idx={idx}
              className={`cust-ac-item ms-ac-item${highlight === idx ? " is-selected" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(idx)}
              onClick={() => pick(item)}
            >
              <span className={`ms-ac-badge ${TYPE_CLASS[item.type] ?? ''}`}>
                {TYPE_LABELS[item.type] ?? item.type}
              </span>
              <span className="ms-ac-body">
                <span className="cust-ac-name">{item.label}</span>
                {item.subLabel ? <span className="cust-ac-meta">{item.subLabel}</span> : null}
              </span>
            </button>
          </li>
        ))
      )}
    </ul>
  ) : null;

  const hint = useMemo(() => (draft.trim().length > 0 && draft.trim().length < 2 ? 'Type at least 2 characters' : ''), [draft]);

  return (
    <div className={`ms-wrap pos-ms-wrap${open ? ' is-open' : ''}`} ref={wrapRef}>
      <span className="ms-icon" aria-hidden>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      </span>
      <input
        ref={inputRef}
        className="ms-input"
        placeholder="Multi Scan — Customer, Product, Model No, Invoice No, Serial No..."
        value={draft}
        autoComplete="off"
        disabled={disabled}
        onChange={(e) => {
          if (disabled) return;
          pickedRef.current = false;
          const value = e.target.value;
          setDraft(value);
          const trimmed = value.trim();
          if (trimmed.length >= 2) {
            setOpen(true);
            updateMenuPosition();
            runSearch(trimmed);
          } else {
            setOpen(false);
            setOptions([]);
          }
        }}
        onFocus={() => {
          if (disabled) return;
          if (draft.trim().length >= 2) {
            setOpen(true);
            updateMenuPosition();
            void loadOptions(draft, false);
          }
        }}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (disabled) return;

          const listOpen = open && draft.trim().length >= 2 && options.length > 0;
          if (listOpen) {
            const handled = handleAutocompleteKeyDown(e, {
              open: true,
              optionCount: options.length,
              highlight,
              moveDown,
              moveUp,
              setHighlight,
              openMenu: () => {
                setOpen(true);
                updateMenuPosition();
              },
              onPickIndex: (index) => {
                const item = options[index];
                if (item) pick(item);
              },
              onEscape: () => {
                setOpen(false);
                setHighlight(-1);
              },
            });
            if (handled) return;
          }

          if (e.key !== 'Enter') return;
          e.preventDefault();
          const trimmed = draft.trim();
          if (trimmed.length < 2) return;

          runSearch.cancel();

          // Prefer already-loaded single match; otherwise search now (scanner Enter).
          if (options.length === 1) {
            pick(options[0]);
            return;
          }
          void loadOptions(trimmed, true).then((result) => {
            if (result.length === 1) return;
            if (result.length > 1) {
              setOpen(true);
              updateMenuPosition();
            }
          });
        }}
      />
      {hint ? <span className="ms-hint">{hint}</span> : null}
      <div className="tip-w">
        <button type="button" className="qr-btn" onClick={onOpenScanner} disabled={disabled} aria-label="Open scanner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none" />
            <rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none" />
            <rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none" />
            <path d="M14 14h3v3M20 14v3M14 20h3M17 20h3v-3" strokeWidth="1.6" />
          </svg>
        </button>
        <div className="tip">QR / Barcode Scan</div>
      </div>
      {menu && createPortal(menu, document.body)}
    </div>
  );
});
