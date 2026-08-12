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
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ProductSerialOption[]>([]);
  const [checked, setChecked] = useState<Map<string, ProductSerialOption>>(() => new Map());
  const [searchSerials] = useLazySearchProductSerialsQuery();
  const reqId = useRef(0);
  const { inputRef, menuRef, wrapRef, menuStyle, updateMenuPosition, isOutside } = useAutocompleteMenu(open, 280);
  const { highlight, setHighlight, moveDown, moveUp } = useAutocompleteHighlight(open, options.length);
  useScrollHighlightedOption(menuRef, highlight, open);

  const selectedSerials = Array.from(checked.values()).map((o) => o.serialNo);

  const inputValue = selectedSerials.length === 0
    ? filterText
    : filterText
      ? `${selectedSerials.join(', ')}, ${filterText}`
      : selectedSerials.join(', ');

  const bindInputRef = useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el;
      if (externalRef) externalRef.current = el;
    },
    [externalRef, inputRef],
  );

  const loadOptions = useCallback(async (term: string) => {
    const id = ++reqId.current;
    try {
      const result = await searchSerials({
        productId,
        locationId,
        q: term.trim() || undefined,
        limit: 50,
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
    }
  }, [exclude, locationId, productId, searchSerials, setHighlight]);

  const runSearch = useDebouncedCallback(loadOptions, 300);

  // When product/location/exclude change while the list is open, refresh options.
  // Focus / type own their own loads — avoid fighting focus browse-all with filterText.
  useEffect(() => {
    if (!open) return;
    void loadOptions(filterText);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fetch on catalog keys
  }, [exclude, locationId, productId]);

  const toggleChecked = useCallback((option: ProductSerialOption) => {
    const key = serialKey(option.serialNo);
    setChecked((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        const limit = maxAddable ?? Number.POSITIVE_INFINITY;
        if (next.size >= limit) {
          onStockLimit?.();
          return prev;
        }
        next.set(key, option);
      }
      return next;
    });
  }, [maxAddable, onStockLimit]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const joined = selectedSerials.join(', ');

    if (selectedSerials.length > 0 && (value === joined || value.startsWith(`${joined},`))) {
      const tail = value === joined ? '' : value.slice(joined.length).replace(/^,\s*/, '');
      setFilterText(tail);
      setOpen(true);
      setHighlight(-1);
      updateMenuPosition();
      runSearch(tail);
      return;
    }

    if (!value.includes(',')) {
      setChecked(new Map());
      setFilterText(value);
      setOpen(true);
      setHighlight(-1);
      updateMenuPosition();
      runSearch(value);
      return;
    }

    const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
    const next = new Map<string, ProductSerialOption>();
    for (const part of parts) {
      const key = serialKey(part);
      next.set(key, checked.get(key) ?? { serialNo: part, discountAmount: 0 });
    }
    setChecked(next);
    setFilterText('');
    setOpen(true);
    setHighlight(-1);
    updateMenuPosition();
    runSearch('');
  }, [checked, runSearch, selectedSerials, setHighlight, updateMenuPosition]);

  const handleFocus = useCallback(() => {
    setOpen(true);
    updateMenuPosition();
    // Focus → browse all serials (do not filter by typed label).
    void loadOptions('');
  }, [loadOptions, updateMenuPosition]);

  const handleBlur = useCallback(() => {
    window.setTimeout(() => setOpen(false), 150);
  }, []);

  const commitAdd = useCallback(() => {
    const picked = Array.from(checked.values());
    if (picked.length) {
      const limit = maxAddable ?? picked.length;
      const toAdd = picked.slice(0, limit);
      if (toAdd.length < picked.length) onStockLimit?.();
      onAdd(toAdd);
      setChecked(new Map());
      setFilterText('');
      void loadOptions('');
      inputRef.current?.focus();
      return;
    }
    const typed = filterText.trim();
    if (typed) {
      if ((maxAddable ?? 1) <= 0) {
        onStockLimit?.();
        return;
      }
      onAdd([{ serialNo: typed, discountAmount: 0 }]);
      setFilterText('');
      void loadOptions('');
      inputRef.current?.focus();
    }
  }, [checked, filterText, inputRef, loadOptions, maxAddable, onAdd, onStockLimit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const handled = handleAutocompleteKeyDown(e, {
      open,
      optionCount: options.length,
      highlight,
      moveDown,
      moveUp,
      setHighlight,
      openMenu: () => {
        setOpen(true);
        updateMenuPosition();
        void loadOptions(filterText);
      },
      onPickIndex: (index) => {
        const item = options[index];
        if (item) toggleChecked(item);
      },
      onEscape: () => {
        setOpen(false);
        setHighlight(-1);
      },
      // Enter with highlight already handled by onPickIndex; bare Enter commits selection.
      onEnterWithoutPick: () => {
        commitAdd();
        return true;
      },
    });
    if (handled) {
      e.stopPropagation();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      commitAdd();
    }
  }, [
    commitAdd,
    filterText,
    highlight,
    loadOptions,
    moveDown,
    moveUp,
    open,
    options,
    setHighlight,
    toggleChecked,
    updateMenuPosition,
  ]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (isOutside(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [isOutside]);

  const checkedCount = checked.size;
  const addLabel = checkedCount > 0 ? `Add (${checkedCount})` : 'Add';

  const menu = open && options.length > 0 ? (
    <ul ref={menuRef} className="cust-ac-list cust-ac-list--portal serial-ac-list" role="listbox" style={menuStyle}>
      {options.map((opt, idx) => {
        const isChecked = checked.has(serialKey(opt.serialNo));
        const isHi = highlight === idx;
        return (
          <li key={opt.serialNo}>
            <button
              type="button"
              data-ac-idx={idx}
              className={`cust-ac-item serial-ac-item${isChecked ? ' is-checked' : ''}${isHi ? ' is-selected' : ''}`}
              aria-selected={isHi || isChecked}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(idx)}
              onClick={() => toggleChecked(opt)}
            >
              <input
                type="checkbox"
                className="serial-ac-check"
                checked={isChecked}
                readOnly
                tabIndex={-1}
              />
              <span className="serial-ac-text">
                <span className="cust-ac-name">{opt.serialNo}</span>
                <span className="cust-ac-meta">
                  {opt.discountAmount > 0 ? `Disc: ${opt.discountAmount}` : '—'}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  ) : null;

  return (
    <>
      <div className={`cust-ac-wrap${open ? ' is-open' : ''}`} ref={wrapRef} style={{ flex: 1 }}>
        <input
          ref={bindInputRef}
          className="mfi"
          value={inputValue}
          autoComplete="off"
          placeholder="Scan or type serial..."
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {menu && createPortal(menu, document.body)}
      </div>
      <button type="button" className="bp" style={{ padding: '0 12px', fontSize: 12 }} onClick={commitAdd}>
        {addLabel}
      </button>
    </>
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
