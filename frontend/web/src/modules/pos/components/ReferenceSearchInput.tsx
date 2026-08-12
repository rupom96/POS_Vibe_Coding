import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReferenceOption } from '../types';
import {
  acItemClass,
  handleAutocompleteKeyDown,
  useAutocompleteBrowseMode,
  useAutocompleteHighlight,
  useScrollHighlightedOption,
} from '../utils/autocompleteBrowse';
import { useAutocompleteMenu } from '../utils/useAutocompleteMenu';

export const ReferenceSearchInput = memo(function ReferenceSearchInput({
  value,
  options,
  disabled = false,
  onSelect,
  onClear,
}: {
  value: ReferenceOption | null;
  options: ReferenceOption[];
  disabled?: boolean;
  onSelect: (reference: ReferenceOption) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const pickedRef = useRef(false);
  const { filterActive, beginBrowse, beginFilter } = useAutocompleteBrowseMode();
  const { inputRef, menuRef, wrapRef, menuStyle, updateMenuPosition, isOutside } = useAutocompleteMenu(open);

  useEffect(() => {
    setDraft(value?.name ?? '');
  }, [value?.allCompanyId, value?.name]);

  const filtered = useMemo(() => {
    if (!filterActive) return options;
    const term = draft.trim().toLowerCase();
    if (!term) return options;
    return options.filter((ref) => ref.name.toLowerCase().includes(term));
  }, [draft, filterActive, options]);

  const { highlight, setHighlight, moveDown, moveUp } = useAutocompleteHighlight(open, filtered.length);
  useScrollHighlightedOption(menuRef, highlight, open);

  const pick = useCallback((reference: ReferenceOption) => {
    pickedRef.current = true;
    setDraft(reference.name);
    setOpen(false);
    setHighlight(-1);
    onSelect(reference);
  }, [onSelect, setHighlight]);

  const handleBlur = useCallback(() => {
    window.setTimeout(() => {
      setOpen(false);
      if (disabled) return;
      if (!pickedRef.current) {
        const exact = options.find((ref) => ref.name.toLowerCase() === draft.trim().toLowerCase());
        if (exact) onSelect(exact);
        else {
          setDraft('');
          onClear();
        }
      }
      pickedRef.current = false;
    }, 120);
  }, [disabled, draft, onClear, onSelect, options]);

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
      {filtered.map((ref, idx) => {
        const selected = value?.allCompanyId === ref.allCompanyId || highlight === idx;
        return (
          <li key={ref.allCompanyId}>
            <button
              type="button"
              data-ac-idx={idx}
              className={acItemClass(selected)}
              aria-selected={selected}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(idx)}
              onClick={() => pick(ref)}
            >
              <span className="cust-ac-name">{ref.name}</span>
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
        autoComplete="off"
        disabled={disabled}
        readOnly={disabled}
        placeholder="Search ref no..."
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
      {menu && createPortal(menu, document.body)}
    </div>
  );
});