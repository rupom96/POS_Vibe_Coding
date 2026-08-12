import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SalesPerson } from '../types';
import {
  acItemClass,
  handleAutocompleteKeyDown,
  useAutocompleteBrowseMode,
  useAutocompleteHighlight,
  useScrollHighlightedOption,
} from '../utils/autocompleteBrowse';
import { useAutocompleteMenu } from '../utils/useAutocompleteMenu';

export const SalesPersonSearchInput = memo(function SalesPersonSearchInput({
  value,
  options,
  disabled,
  onSelect,
  onClear,
}: {
  value: SalesPerson | null;
  options: SalesPerson[];
  disabled?: boolean;
  onSelect: (salesPerson: SalesPerson) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const pickedRef = useRef(false);
  const { filterActive, beginBrowse, beginFilter } = useAutocompleteBrowseMode();
  const { inputRef, menuRef, wrapRef, menuStyle, updateMenuPosition, isOutside } = useAutocompleteMenu(open);

  useEffect(() => {
    setDraft(value?.name ?? '');
  }, [value?.employeeId, value?.name]);

  const filtered = useMemo(() => {
    if (!filterActive) return options;
    const term = draft.trim().toLowerCase();
    if (!term) return options;
    return options.filter((sp) => sp.name.toLowerCase().includes(term));
  }, [draft, filterActive, options]);

  const { highlight, setHighlight, moveDown, moveUp } = useAutocompleteHighlight(open, filtered.length);
  useScrollHighlightedOption(menuRef, highlight, open);

  const pick = useCallback((salesPerson: SalesPerson) => {
    pickedRef.current = true;
    setDraft(salesPerson.name);
    setOpen(false);
    setHighlight(-1);
    onSelect(salesPerson);
  }, [onSelect, setHighlight]);

  const handleBlur = useCallback(() => {
    window.setTimeout(() => {
      setOpen(false);
      if (!pickedRef.current) {
        const exact = options.find((sp) => sp.name.toLowerCase() === draft.trim().toLowerCase());
        if (exact) onSelect(exact);
        else {
          setDraft('');
          onClear();
        }
      }
      pickedRef.current = false;
    }, 120);
  }, [draft, onClear, onSelect, options]);

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

  const menu = open && filtered.length > 0 ? (
    <ul ref={menuRef} className="cust-ac-list cust-ac-list--portal" role="listbox" style={menuStyle}>
      {filtered.map((sp, idx) => {
        const selected = value?.employeeId === sp.employeeId || highlight === idx;
        return (
          <li key={sp.employeeId}>
            <button
              type="button"
              data-ac-idx={idx}
              className={acItemClass(selected)}
              aria-selected={selected}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(idx)}
              onClick={() => pick(sp)}
            >
              <span className="cust-ac-name">{sp.name}</span>
              <span className="cust-ac-meta">Employee ID: {sp.employeeId}</span>
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
        className="fv"
        value={draft}
        disabled={disabled}
        readOnly={disabled}
        autoComplete="off"
        placeholder={disabled ? 'Sales person locked' : 'Search sales person...'}
        onChange={(e) => {
          if (disabled) return;
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
      {!disabled && menu && createPortal(menu, document.body)}
    </div>
  );
});
