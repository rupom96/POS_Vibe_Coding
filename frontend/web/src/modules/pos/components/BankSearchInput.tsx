import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BankOption } from '../types';
import {
  acItemClass,
  handleAutocompleteKeyDown,
  useAutocompleteBrowseMode,
  useAutocompleteHighlight,
  useScrollHighlightedOption,
} from '../utils/autocompleteBrowse';
import { useAutocompleteMenu } from '../utils/useAutocompleteMenu';

export const BankSearchInput = memo(function BankSearchInput({
  value,
  options,
  onSelect,
  onClear,
  disabled,
  readOnly,
  placeholder = 'Search bank...',
}: {
  value: BankOption | null;
  options: BankOption[];
  onSelect: (bank: BankOption) => void;
  onClear: () => void;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value?.bankName ?? '');
  const [open, setOpen] = useState(false);
  const pickedRef = useRef(false);
  const { filterActive, beginBrowse, beginFilter } = useAutocompleteBrowseMode();
  const { inputRef, menuRef, wrapRef, menuStyle, updateMenuPosition, isOutside } = useAutocompleteMenu(open);

  useEffect(() => {
    setDraft(value?.bankName ?? '');
  }, [value?.bankId, value?.bankName]);

  const filtered = useMemo(() => {
    if (!filterActive) return options;
    const term = draft.trim().toLowerCase();
    if (!term) return options;
    return options.filter((bank) => bank.bankName.toLowerCase().includes(term));
  }, [draft, filterActive, options]);

  const { highlight, setHighlight, moveDown, moveUp } = useAutocompleteHighlight(open, filtered.length);
  useScrollHighlightedOption(menuRef, highlight, open);

  const pick = useCallback((bank: BankOption) => {
    pickedRef.current = true;
    setDraft(bank.bankName);
    setOpen(false);
    setHighlight(-1);
    onSelect(bank);
  }, [onSelect, setHighlight]);

  const handleBlur = useCallback(() => {
    window.setTimeout(() => {
      setOpen(false);
      if (readOnly || disabled) return;
      if (!pickedRef.current) {
        const exact = options.find((bank) => bank.bankName.toLowerCase() === draft.trim().toLowerCase());
        if (exact) onSelect(exact);
        else {
          setDraft('');
          onClear();
        }
      }
      pickedRef.current = false;
    }, 120);
  }, [disabled, draft, onClear, onSelect, options, readOnly]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (isOutside(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [isOutside]);

  const locked = disabled || readOnly;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    handleAutocompleteKeyDown(e, {
      disabled: locked,
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
  }, [beginBrowse, filtered, highlight, locked, moveDown, moveUp, open, pick, setHighlight, updateMenuPosition]);

  const menu = open && !locked && filtered.length > 0 ? (
    <ul ref={menuRef} className="cust-ac-list cust-ac-list--portal" role="listbox" style={menuStyle}>
      {filtered.map((bank, idx) => {
        const selected = value?.bankId === bank.bankId || highlight === idx;
        return (
          <li key={bank.bankId}>
            <button
              type="button"
              data-ac-idx={idx}
              className={acItemClass(selected)}
              aria-selected={selected}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(idx)}
              onClick={() => pick(bank)}
            >
              <span className="cust-ac-name">{bank.bankName}</span>
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
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(e) => {
          if (locked) return;
          pickedRef.current = false;
          beginFilter();
          setDraft(e.target.value);
          setOpen(true);
          setHighlight(-1);
          updateMenuPosition();
          if (!e.target.value.trim()) onClear();
        }}
        onFocus={() => {
          if (locked) return;
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

export function findBankOption(banks: BankOption[], name?: string): BankOption | null {
  const term = name?.trim().toLowerCase();
  if (!term) return null;
  return banks.find((b) => b.bankName.toLowerCase() === term)
    ?? banks.find((b) => b.bankName.toLowerCase().includes(term) || term.includes(b.bankName.toLowerCase()))
    ?? null;
}