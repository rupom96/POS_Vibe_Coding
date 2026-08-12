import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PaymentMode } from '../types';
import {
  acItemClass,
  handleAutocompleteKeyDown,
  useAutocompleteBrowseMode,
  useAutocompleteHighlight,
  useScrollHighlightedOption,
} from '../utils/autocompleteBrowse';
import { useAutocompleteMenu } from '../utils/useAutocompleteMenu';

export const PaymentModeSearchInput = memo(function PaymentModeSearchInput({
  value,
  options,
  onSelect,
  onClear,
  placeholder = 'Search pay mode...',
  disabled = false,
  showParent = false,
}: {
  value: PaymentMode | null;
  options: PaymentMode[];
  onSelect: (mode: PaymentMode) => void;
  onClear: () => void;
  placeholder?: string;
  disabled?: boolean;
  showParent?: boolean;
}) {
  const [draft, setDraft] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const pickedRef = useRef(false);
  const { filterActive, beginBrowse, beginFilter } = useAutocompleteBrowseMode();
  const { inputRef, menuRef, wrapRef, menuStyle, updateMenuPosition, isOutside } = useAutocompleteMenu(open);

  useEffect(() => {
    setDraft(value?.name ?? '');
  }, [value?.paymentModeId, value?.name]);

  const filtered = useMemo(() => {
    if (!filterActive) return options;
    const term = draft.trim().toLowerCase();
    if (!term) return options;
    return options.filter((m) => {
      const haystack = [m.name, m.parentName].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [draft, filterActive, options]);

  const { highlight, setHighlight, moveDown, moveUp } = useAutocompleteHighlight(open, filtered.length);
  useScrollHighlightedOption(menuRef, highlight, open);

  const pick = useCallback((mode: PaymentMode) => {
    pickedRef.current = true;
    setDraft(mode.name);
    setOpen(false);
    setHighlight(-1);
    onSelect(mode);
  }, [onSelect, setHighlight]);

  const handleBlur = useCallback(() => {
    window.setTimeout(() => {
      setOpen(false);
      if (!pickedRef.current) {
        const exact = options.find((m) => m.name.toLowerCase() === draft.trim().toLowerCase());
        if (exact) onSelect(exact);
        else {
          setDraft(value?.name ?? '');
          if (!draft.trim()) onClear();
        }
      }
      pickedRef.current = false;
    }, 120);
  }, [draft, onClear, onSelect, options, value?.name]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (isOutside(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [isOutside]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    handleAutocompleteKeyDown(e, {
      disabled,
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
  }, [beginBrowse, disabled, filtered, highlight, moveDown, moveUp, open, pick, setHighlight, updateMenuPosition]);

  const menu = open && !disabled && filtered.length > 0 ? (
    <ul ref={menuRef} className="cust-ac-list cust-ac-list--portal" role="listbox" style={menuStyle}>
      {filtered.map((m, idx) => {
        const selected = value?.paymentModeId === m.paymentModeId || highlight === idx;
        return (
          <li key={m.paymentModeId}>
            <button
              type="button"
              data-ac-idx={idx}
              className={acItemClass(selected)}
              aria-selected={selected}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(idx)}
              onClick={() => pick(m)}
            >
              <span className="cust-ac-name">{m.name}</span>
              {showParent && m.parentName && (
                <span className="cust-ac-meta">Parent: {m.parentName}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  ) : null;

  return (
    <div className={`cust-ac-wrap${open ? ' is-open' : ''}`} ref={wrapRef} style={{ flex: 1, minWidth: 0 }}>
      <input
        ref={inputRef}
        className="fv"
        value={draft}
        disabled={disabled}
        autoComplete="off"
        placeholder={placeholder}
        style={{ color: disabled ? 'var(--text3)' : undefined }}
        onChange={(e) => {
          pickedRef.current = false;
          beginFilter();
          setDraft(e.target.value);
          setOpen(true);
          setHighlight(-1);
          updateMenuPosition();
          if (!e.target.value.trim()) onClear();
        }}
        onFocus={() => {
          if (disabled) return;
          beginBrowse();
          setOpen(true);
          updateMenuPosition();
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {menu && createPortal(menu, document.body)}
    </div>
  );
});
