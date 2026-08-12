import { useCallback, useEffect, useState, type KeyboardEvent, type RefObject } from 'react';

/**
 * Autocomplete browse vs filter mode:
 * - Focus/open with a selection → show all options (browse)
 * - User types → filter by draft
 */
export function useAutocompleteBrowseMode() {
  const [filterActive, setFilterActive] = useState(false);

  const beginBrowse = useCallback(() => {
    setFilterActive(false);
  }, []);

  const beginFilter = useCallback(() => {
    setFilterActive(true);
  }, []);

  return { filterActive, beginBrowse, beginFilter };
}

export function acItemClass(selected: boolean): string {
  return selected ? 'cust-ac-item is-selected' : 'cust-ac-item';
}

/** Keyboard highlight index for portal listboxes (ArrowUp/Down + Enter). */
export function useAutocompleteHighlight(open: boolean, optionCount: number) {
  const [highlight, setHighlight] = useState(-1);

  useEffect(() => {
    if (!open) setHighlight(-1);
  }, [open]);

  useEffect(() => {
    if (highlight >= optionCount) {
      setHighlight(optionCount > 0 ? optionCount - 1 : -1);
    }
  }, [highlight, optionCount]);

  const moveDown = useCallback(() => {
    if (optionCount <= 0) return;
    setHighlight((h) => (h < 0 ? 0 : Math.min(h + 1, optionCount - 1)));
  }, [optionCount]);

  const moveUp = useCallback(() => {
    if (optionCount <= 0) return;
    setHighlight((h) => (h <= 0 ? 0 : h - 1));
  }, [optionCount]);

  return { highlight, setHighlight, moveDown, moveUp };
}

/** Keep the highlighted option visible when the list scrolls. */
export function useScrollHighlightedOption(
  menuRef: RefObject<HTMLElement | null>,
  highlight: number,
  open: boolean,
) {
  useEffect(() => {
    if (!open || highlight < 0) return;
    const menu = menuRef.current;
    if (!menu) return;
    const item =
      menu.querySelector<HTMLElement>(`[data-ac-idx="${highlight}"]`)
      ?? (menu.children.item(highlight) as HTMLElement | null)?.querySelector?.('button')
      ?? (menu.children.item(highlight) as HTMLElement | null);
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlight, menuRef, open]);
}

type ListKeyHandlers = {
  disabled?: boolean;
  open: boolean;
  optionCount: number;
  highlight: number;
  moveDown: () => void;
  moveUp: () => void;
  setHighlight: (value: number | ((h: number) => number)) => void;
  openMenu: () => void;
  onPickIndex: (index: number) => void;
  /** Escape / other — optional callbacks after handling Escape. */
  onEscape?: () => void;
  /**
   * Enter when list open but no valid highlight (and not a single exact match path).
   * Return true if handled (e.g. product empty → Save).
   */
  onEnterWithoutPick?: () => boolean;
};

/**
 * Shared ArrowUp / ArrowDown / Enter / Escape handling for POS autocompletes.
 * Returns true if the event was handled (caller may stopPropagation if needed).
 */
export function handleAutocompleteKeyDown(
  e: KeyboardEvent,
  opts: ListKeyHandlers,
): boolean {
  if (opts.disabled) return false;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!opts.open) opts.openMenu();
    opts.moveDown();
    return true;
  }

  if (e.key === 'ArrowUp') {
    if (!opts.open || opts.optionCount === 0) return false;
    e.preventDefault();
    opts.moveUp();
    return true;
  }

  if (e.key === 'Escape') {
    if (!opts.open) return false;
    e.preventDefault();
    opts.onEscape?.();
    return true;
  }

  if (e.key !== 'Enter') return false;

  if (opts.open && opts.optionCount > 0) {
    e.preventDefault();
    if (opts.highlight >= 0 && opts.highlight < opts.optionCount) {
      opts.onPickIndex(opts.highlight);
      return true;
    }
    if (opts.onEnterWithoutPick?.()) return true;
    return true;
  }

  return false;
}
