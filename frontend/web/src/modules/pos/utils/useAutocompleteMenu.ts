import { useCallback, useEffect, useRef, useState } from 'react';

export function useAutocompleteMenu(open: boolean, minWidth = 240) {
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const updateMenuPosition = useCallback(() => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 2,
      left: rect.left,
      width: Math.max(rect.width, minWidth),
      zIndex: 1100,
    });
  }, [minWidth]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const onReposition = () => updateMenuPosition();
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open, updateMenuPosition]);

  const isOutside = useCallback((target: Node) => {
    return !wrapRef.current?.contains(target) && !menuRef.current?.contains(target);
  }, []);

  return { inputRef, menuRef, wrapRef, menuStyle, updateMenuPosition, isOutside };
}
