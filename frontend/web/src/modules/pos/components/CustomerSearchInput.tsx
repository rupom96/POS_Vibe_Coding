import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLazySearchCustomersQuery } from '../api/posApi';
import type { CustomerSearchResult } from '../types';
import {
  acItemClass,
  handleAutocompleteKeyDown,
  useAutocompleteHighlight,
  useScrollHighlightedOption,
} from '../utils/autocompleteBrowse';
import { useDebouncedCallback } from '../utils/debounce';
import { useAutocompleteMenu } from '../utils/useAutocompleteMenu';

const BROWSE_LIMIT = 5000;

export type CustomerSearchVariant = 'name' | 'phone';

export const CustomerSearchInput = memo(function CustomerSearchInput({
  value,
  companyId,
  variant = 'name',
  refreshKey,
  selectedBuyerId,
  disabled = false,
  onCommit,
  onSelect,
  onHoverEnter,
  onHoverLeave,
}: {
  value: string;
  companyId: number;
  variant?: CustomerSearchVariant;
  refreshKey?: number;
  selectedBuyerId?: number;
  disabled?: boolean;
  onCommit: (value: string) => void;
  onSelect: (customer: CustomerSearchResult) => void;
  onHoverEnter?: (rect: DOMRect) => void;
  onHoverLeave?: () => void;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<CustomerSearchResult[]>([]);
  const [searchCustomers] = useLazySearchCustomersQuery();
  const reqId = useRef(0);
  const companyIdRef = useRef(companyId);
  const pickedRef = useRef(false);
  const { inputRef, menuRef, wrapRef, menuStyle, updateMenuPosition, isOutside } = useAutocompleteMenu(open);
  const { highlight, setHighlight, moveDown, moveUp } = useAutocompleteHighlight(open, options.length);
  useScrollHighlightedOption(menuRef, highlight, open);

  companyIdRef.current = companyId;

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  const loadOptions = useCallback(async (term: string) => {
    const trimmed = (term ?? '').trim();
    const id = ++reqId.current;
    try {
      const result = await searchCustomers({
        q: trimmed || undefined,
        companyId: companyIdRef.current > 0 ? companyIdRef.current : undefined,
        limit: BROWSE_LIMIT,
      }).unwrap();
      if (id === reqId.current) {
        setOptions(result.map((x) => ({ ...x, buyerName: x.buyerName ?? x.name ?? '' })));
        setHighlight(-1);
      }
    } catch {
      if (id === reqId.current) {
        setOptions([]);
        setHighlight(-1);
      }
    }
  }, [searchCustomers, setHighlight]);

  const runSearch = useDebouncedCallback(loadOptions, 350);

  useEffect(() => {
    if (open) loadOptions('');
  }, [companyId]);

  useEffect(() => {
    if (refreshKey === undefined || refreshKey === 0) return;
    void loadOptions('');
  }, [refreshKey, loadOptions]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const next = variant === 'phone' ? e.target.value.replace(/\D/g, '') : e.target.value;
    setDraft(next);
    setOpen(true);
    pickedRef.current = false;
    setHighlight(-1);
    updateMenuPosition();
    runSearch(next);
  }, [disabled, runSearch, setHighlight, updateMenuPosition, variant]);

  const hoveringRef = useRef(false);

  const showStatsTip = useCallback(() => {
    if (!onHoverEnter || !selectedBuyerId || selectedBuyerId <= 0) return;
    if (open || !hoveringRef.current) return;
    if (inputRef.current) onHoverEnter(inputRef.current.getBoundingClientRect());
  }, [onHoverEnter, open, selectedBuyerId, inputRef]);

  const hideStatsTip = useCallback(() => {
    onHoverLeave?.();
  }, [onHoverLeave]);

  const handleFocus = useCallback(() => {
    if (disabled) return;
    hideStatsTip();
    setOpen(true);
    updateMenuPosition();
    void loadOptions('');
  }, [disabled, hideStatsTip, loadOptions, updateMenuPosition]);

  const pick = useCallback((customer: CustomerSearchResult) => {
    pickedRef.current = true;
    setDraft(
      variant === 'phone'
        ? (customer.phone ?? '')
        : (customer.buyerName ?? customer.name ?? ''),
    );
    setOpen(false);
    setOptions([]);
    setHighlight(-1);
    hideStatsTip();
    onSelect(customer);
  }, [hideStatsTip, onSelect, setHighlight, variant]);

  const handleBlur = useCallback(() => {
    window.setTimeout(() => {
      setOpen(false);
      if (disabled) return;
      if (!pickedRef.current && (draft ?? '').trim() !== (value ?? '').trim()) {
        onCommit(draft ?? '');
      }
      if (hoveringRef.current) showStatsTip();
    }, 120);
  }, [disabled, draft, onCommit, showStatsTip, value]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (isOutside(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [isOutside]);

  useEffect(() => {
    if (open) {
      hideStatsTip();
      return;
    }
    if (hoveringRef.current) showStatsTip();
  }, [hideStatsTip, open, showStatsTip]);

  useEffect(() => {
    if (!selectedBuyerId || selectedBuyerId <= 0) hideStatsTip();
  }, [hideStatsTip, selectedBuyerId]);

  useEffect(() => {
    if (!onHoverLeave) return;
    const onMove = (e: MouseEvent) => {
      if (!hoveringRef.current || !wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        hoveringRef.current = false;
        hideStatsTip();
      }
    };
    document.addEventListener('mousemove', onMove, true);
    return () => document.removeEventListener('mousemove', onMove, true);
  }, [hideStatsTip, onHoverLeave, wrapRef]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const handled = handleAutocompleteKeyDown(e, {
      disabled,
      open,
      optionCount: options.length,
      highlight,
      moveDown,
      moveUp,
      setHighlight,
      openMenu: () => {
        setOpen(true);
        updateMenuPosition();
        void loadOptions(draft);
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
    if (handled) e.stopPropagation();
  }, [
    disabled,
    draft,
    highlight,
    loadOptions,
    moveDown,
    moveUp,
    open,
    options,
    pick,
    setHighlight,
    updateMenuPosition,
  ]);

  const isSelected = (c: CustomerSearchResult) => {
    if (selectedBuyerId && selectedBuyerId > 0) return c.buyerId === selectedBuyerId;
    const label = (value ?? '').trim().toLowerCase();
    if (!label) return false;
    if (variant === 'phone') return (c.phone ?? '').trim().toLowerCase() === label;
    return (c.buyerName ?? c.name ?? '').trim().toLowerCase() === label;
  };

  const menu = open && !disabled && options.length > 0 ? (
    <ul ref={menuRef} className="cust-ac-list cust-ac-list--portal" role="listbox" style={menuStyle}>
      {options.map((c, idx) => (
        <li key={c.buyerId}>
          <button
            type="button"
            data-ac-idx={idx}
            className={acItemClass(isSelected(c) || highlight === idx)}
            aria-selected={isSelected(c) || highlight === idx}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setHighlight(idx)}
            onClick={() => pick(c)}
          >
            <span className="cust-ac-name">{c.buyerName ?? c.name}</span>
            <span className="cust-ac-meta">{[c.phone, c.address].filter(Boolean).join(' · ') || '—'}</span>
            {(c.employeeName) && (
              <span className="cust-ac-emp">{c.employeeName}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <div
      className={`cust-ac-wrap${open ? ' is-open' : ''}`}
      ref={wrapRef}
      onMouseEnter={() => {
        hoveringRef.current = true;
        showStatsTip();
      }}
      onMouseLeave={() => {
        hoveringRef.current = false;
        hideStatsTip();
      }}
    >
      <input
        ref={inputRef}
        className={`fv${variant === 'phone' ? ' mono' : ''}`}
        value={draft}
        autoComplete="off"
        disabled={disabled}
        readOnly={disabled}
        placeholder={variant === 'phone' ? 'Search mobile no...' : 'Search customer...'}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {menu && createPortal(menu, document.body)}
    </div>
  );
});