import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLazyGetSerialPrefixesQuery, useLazySearchProductSerialsQuery } from '../../api/posApi';
import type { ProductSerialOption } from '../../types';
import {
  acItemClass,
  handleAutocompleteKeyDown,
  useAutocompleteHighlight,
  useScrollHighlightedOption,
} from '../../utils/autocompleteBrowse';
import { useDebouncedCallback } from '../../utils/debounce';
import { useAutocompleteMenu } from '../../utils/useAutocompleteMenu';

function serialKey(serialNo: string) {
  return serialNo.trim().toLowerCase();
}

export const SerialSearchInput = memo(function SerialSearchInput({
  productId,
  locationId,
  exclude,
  maxAddable,
  onAdd,
  onStockLimit,
  inputRef: externalRef,
}: {
  productId: number;
  locationId: number;
  exclude: string[];
  maxAddable?: number;
  onAdd: (options: ProductSerialOption[]) => void;
  onStockLimit?: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [filterText, setFilterText] = useState('');
  const [options, setOptions] = useState<ProductSerialOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchSerials] = useLazySearchProductSerialsQuery();
  const reqId = useRef(0);
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const { highlight, setHighlight, moveDown, moveUp } = useAutocompleteHighlight(true, options.length);
  useScrollHighlightedOption(listRef, highlight, true);

  const bindInputRef = useCallback(
    (el: HTMLInputElement | null) => {
      localInputRef.current = el;
      if (externalRef) externalRef.current = el;
    },
    [externalRef],
  );

  const loadOptions = useCallback(async (term: string) => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const result = await searchSerials({
        productId,
        locationId,
        q: term.trim() || undefined,
        limit: 200,
        exclude,
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
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [exclude, locationId, productId, searchSerials, setHighlight]);

  const runSearch = useDebouncedCallback(loadOptions, 250);

  useEffect(() => {
    void loadOptions(filterText);
    // Reload when grid serials change so deleted serials reappear in the box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exclude, locationId, productId]);

  const pick = useCallback((option: ProductSerialOption) => {
    if ((maxAddable ?? 1) <= 0) {
      onStockLimit?.();
      return;
    }
    onAdd([option]);
    localInputRef.current?.focus();
  }, [maxAddable, onAdd, onStockLimit]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFilterText(value);
    setHighlight(-1);
    runSearch(value);
  }, [runSearch, setHighlight]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (options.length) moveDown();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (options.length) moveUp();
      return;
    }
    if (e.key === 'Escape') {
      setHighlight(-1);
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();

    if (highlight >= 0 && options[highlight]) {
      pick(options[highlight]);
      return;
    }

    const typed = filterText.trim();
    if (!typed) return;
    const exact = options.find((o) => serialKey(o.serialNo) === serialKey(typed));
    if (exact) {
      pick(exact);
      setFilterText('');
      void loadOptions('');
      return;
    }
    if ((maxAddable ?? 1) <= 0) {
      onStockLimit?.();
      return;
    }
    onAdd([{ serialNo: typed, discountAmount: 0 }]);
    setFilterText('');
    void loadOptions('');
  }, [
    filterText,
    highlight,
    loadOptions,
    maxAddable,
    moveDown,
    moveUp,
    onAdd,
    onStockLimit,
    options,
    pick,
  ]);

  const emptyLabel = loading
    ? 'Loading serials…'
    : filterText.trim()
      ? 'No matching serials'
      : 'No serials available';

  return (
    <div className="serial-pick">
      <input
        ref={bindInputRef}
        className="mfi"
        value={filterText}
        autoComplete="off"
        placeholder="Search serial..."
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      <div ref={listRef} className="serial-pick-box" role="listbox" aria-label="Available serials">
        {options.length === 0 ? (
          <div className="serial-pick-empty">{emptyLabel}</div>
        ) : (
          options.map((opt, idx) => {
            const isHi = highlight === idx;
            return (
              <button
                key={opt.serialNo}
                type="button"
                data-ac-idx={idx}
                className={`serial-pick-item${isHi ? ' is-selected' : ''}`}
                role="option"
                aria-selected={isHi}
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => pick(opt)}
              >
                <span className="serial-pick-no">{opt.serialNo}</span>
                {opt.discountAmount > 0 ? (
                  <span className="serial-pick-meta">Disc: {opt.discountAmount}</span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
});

export const SerialPrefixInput = memo(function SerialPrefixInput({
  productId,
  locationId,
  value,
  onChange,
}: {
  productId: number;
  locationId: number;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [fetchPrefixes] = useLazyGetSerialPrefixesQuery();
  const { inputRef, menuRef, wrapRef, menuStyle, updateMenuPosition, isOutside } = useAutocompleteMenu(open);
  const { highlight, setHighlight, moveDown, moveUp } = useAutocompleteHighlight(open, options.length);
  useScrollHighlightedOption(menuRef, highlight, open);

  const runSearch = useDebouncedCallback(async (term: string) => {
    try {
      const result = await fetchPrefixes({
        productId,
        locationId,
        q: term.trim() || undefined,
      }).unwrap();
      setOptions(result);
      setHighlight(-1);
    } catch {
      setOptions([]);
      setHighlight(-1);
    }
  }, 300);

  const load = useCallback(async (term: string) => {
    try {
      const result = await fetchPrefixes({
        productId,
        locationId,
        q: term.trim() || undefined,
      }).unwrap();
      setOptions(result);
      setHighlight(-1);
    } catch {
      setOptions([]);
      setHighlight(-1);
    }
  }, [fetchPrefixes, locationId, productId, setHighlight]);

  const pick = useCallback((prefix: string) => {
    onChange(prefix);
    setOpen(false);
    setHighlight(-1);
  }, [onChange, setHighlight]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    handleAutocompleteKeyDown(e, {
      open,
      optionCount: options.length,
      highlight,
      moveDown,
      moveUp,
      setHighlight,
      openMenu: () => {
        setOpen(true);
        updateMenuPosition();
        void load(value);
      },
      onPickIndex: (index) => {
        const item = options[index];
        if (item != null) pick(item);
      },
      onEscape: () => {
        setOpen(false);
        setHighlight(-1);
      },
    });
  }, [
    highlight,
    load,
    moveDown,
    moveUp,
    open,
    options,
    pick,
    setHighlight,
    updateMenuPosition,
    value,
  ]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (isOutside(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [isOutside]);

  const menu = open && options.length > 0 ? (
    <ul ref={menuRef} className="cust-ac-list cust-ac-list--portal" role="listbox" style={menuStyle}>
      {options.map((prefix, idx) => (
        <li key={prefix}>
          <button
            type="button"
            data-ac-idx={idx}
            className={acItemClass(highlight === idx || value === prefix)}
            aria-selected={highlight === idx || value === prefix}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setHighlight(idx)}
            onClick={() => pick(prefix)}
          >
            <span className="cust-ac-name">{prefix}</span>
          </button>
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <div className={`cust-ac-wrap${open ? ' is-open' : ''}`} ref={wrapRef}>
      <input
        ref={inputRef}
        className="mfi"
        value={value}
        autoComplete="off"
        placeholder="e.g. SAM"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(-1);
          updateMenuPosition();
          runSearch(e.target.value);
        }}
        onFocus={() => {
          setOpen(true);
          updateMenuPosition();
          void load('');
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={handleKeyDown}
      />
      {menu && createPortal(menu, document.body)}
    </div>
  );
});
