import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { useLazySearchProductsQuery } from '../api/posApi';
import type { ProductSearchResult } from '../types';
import { acItemClass, useScrollHighlightedOption } from '../utils/autocompleteBrowse';
import { useDebouncedCallback } from '../utils/debounce';
import { useAutocompleteMenu } from '../utils/useAutocompleteMenu';

const BROWSE_LIMIT = 5000;

export type ProductSearchInputHandle = {
  focus: () => void;
  getInput: () => HTMLInputElement | null;
};

export const ProductSearchInput = memo(forwardRef<ProductSearchInputHandle, {
  value: string;
  locationId: number;
  companyId: number;
  lineId?: string;
  excludeProductIds?: number[];
  selectedProductId?: number;
  disabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onNameCommit: (name: string) => void;
  onSelect: (product: ProductSearchResult) => void;
  /** Enter on empty product field (menu not selecting) — e.g. focus Save. */
  onEmptyEnter?: () => void;
  /** Enter when a product is already chosen and the list is closed — e.g. focus Quantity. */
  onEnterWithSelection?: () => void;
}>(function ProductSearchInput({
  value,
  locationId,
  companyId,
  lineId,
  excludeProductIds,
  selectedProductId,
  disabled,
  onFocus,
  onBlur,
  onNameCommit,
  onSelect,
  onEmptyEnter,
  onEnterWithSelection,
}, ref) {
  const [draft, setDraft] = useState(value ?? '');
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [options, setOptions] = useState<ProductSearchResult[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const [searchProducts] = useLazySearchProductsQuery();
  const reqId = useRef(0);
  const locationIdRef = useRef(locationId);
  const companyIdRef = useRef(companyId);
  const pickedRef = useRef(false);
  const { inputRef, menuRef, wrapRef, menuStyle, updateMenuPosition, isOutside } = useAutocompleteMenu(open);
  useScrollHighlightedOption(menuRef, highlight, open);

  locationIdRef.current = locationId;
  companyIdRef.current = companyId;

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
    getInput: () => inputRef.current,
  }), [inputRef]);

  const excludeSet = useMemo(
    () => new Set((excludeProductIds ?? []).filter((id) => id > 0)),
    [excludeProductIds],
  );

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  const loadOptions = useCallback(async (term: string) => {
    const trimmed = (term ?? '').trim();
    const id = ++reqId.current;
    try {
      const result = await searchProducts({
        q: trimmed || undefined,
        locationId: locationIdRef.current > 0 ? locationIdRef.current : undefined,
        companyId: companyIdRef.current > 0 ? companyIdRef.current : undefined,
        limit: BROWSE_LIMIT,
      }).unwrap();
      if (id === reqId.current) {
        setOptions(result);
        setHighlight(-1);
      }
    } catch {
      if (id === reqId.current) {
        setOptions([]);
        setHighlight(-1);
      }
    }
  }, [searchProducts]);

  const runSearch = useDebouncedCallback(loadOptions, 350);

  useEffect(() => {
    if (open) loadOptions('');
  }, [locationId, companyId]);

  const visibleOptions = useMemo(
    () => (excludeSet.size === 0 ? options : options.filter((p) => !excludeSet.has(p.productId))),
    [excludeSet, options],
  );

  useEffect(() => {
    if (!open) setHighlight(-1);
  }, [open]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setDraft(next);
    setOpen(true);
    pickedRef.current = false;
    setHighlight(-1);
    updateMenuPosition();
    runSearch(next);
  }, [runSearch, updateMenuPosition]);

  const handleFocus = useCallback(() => {
    setFocused(true);
    onFocus?.();
    setOpen(true);
    updateMenuPosition();
    void loadOptions('');
  }, [loadOptions, onFocus, updateMenuPosition]);

  const pick = useCallback((product: ProductSearchResult) => {
    pickedRef.current = true;
    setDraft(product.name);
    setOpen(false);
    setOptions([]);
    setHighlight(-1);
    onSelect(product);
  }, [onSelect]);

  const handleBlur = useCallback(() => {
    window.setTimeout(() => {
      setFocused(false);
      setOpen(false);
      onBlur?.();
      if (!pickedRef.current) onNameCommit(draft ?? '');
    }, 120);
  }, [draft, onBlur, onNameCommit]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (isOutside(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [isOutside]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      if (!open) {
        setOpen(true);
        updateMenuPosition();
        void loadOptions(draft);
      }
      if (visibleOptions.length === 0) return;
      e.preventDefault();
      setHighlight((h) => (h < 0 ? 0 : Math.min(h + 1, visibleOptions.length - 1)));
      return;
    }

    if (e.key === 'ArrowUp') {
      if (!open || visibleOptions.length === 0) return;
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? 0 : h - 1));
      return;
    }

    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setHighlight(-1);
      }
      return;
    }

    if (e.key !== 'Enter') return;

    // Autocomplete open: complete selection first; never Save mid-highlight.
    if (open && visibleOptions.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      if (highlight >= 0 && highlight < visibleOptions.length) {
        pick(visibleOptions[highlight]);
        return;
      }
      // Typed query with one match → select it.
      if ((draft ?? '').trim() && visibleOptions.length === 1) {
        pick(visibleOptions[0]);
        return;
      }
      // Empty product + list open without highlight → Save (no extra row).
      if (!(draft ?? '').trim()) {
        setOpen(false);
        setHighlight(-1);
        onEmptyEnter?.();
      }
      return;
    }

    // Product already selected, list closed → Quantity
    if (selectedProductId && selectedProductId > 0 && !open) {
      e.preventDefault();
      e.stopPropagation();
      onEnterWithSelection?.();
      return;
    }

    // Empty product cell → Save
    if (!(draft ?? '').trim()) {
      e.preventDefault();
      e.stopPropagation();
      onEmptyEnter?.();
    }
  }, [
    disabled,
    draft,
    highlight,
    loadOptions,
    onEmptyEnter,
    onEnterWithSelection,
    open,
    pick,
    selectedProductId,
    updateMenuPosition,
    visibleOptions,
  ]);

  const isSelected = (p: ProductSearchResult) => {
    if (selectedProductId && selectedProductId > 0) return p.productId === selectedProductId;
    const label = (value ?? '').trim().toLowerCase();
    return !!label && p.name.trim().toLowerCase() === label;
  };

  const menu = open && visibleOptions.length > 0 ? (
    <ul ref={menuRef} className="cust-ac-list cust-ac-list--portal" role="listbox" style={menuStyle}>
      {visibleOptions.map((p, idx) => (
        <li key={p.productId}>
          <button
            type="button"
            data-ac-idx={idx}
            className={acItemClass(isSelected(p) || highlight === idx)}
            aria-selected={isSelected(p) || highlight === idx}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setHighlight(idx)}
            onClick={() => pick(p)}
          >
            <span className="cust-ac-name">{p.name}</span>
            <span className="cust-ac-meta">
              {[p.modelNo, p.barcode, p.groupName].filter(Boolean).join(' · ') || '—'}
            </span>
            {p.isSerial && <span className="cust-ac-emp">Serial product</span>}
          </button>
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <div className={`cust-ac-wrap${open ? ' is-open' : ''}${focused ? ' is-focused' : ''}`} ref={wrapRef}>
      <input
        ref={inputRef}
        className="ug-inp ug-prod-inp"
        value={draft}
        disabled={disabled}
        autoComplete="off"
        placeholder="Search product / barcode..."
        data-product-line-id={lineId}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {menu && createPortal(menu, document.body)}
    </div>
  );
}));
