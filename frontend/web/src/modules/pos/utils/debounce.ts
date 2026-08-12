import { useMemo, useRef } from 'react';

export function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: T) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced as ((...args: T) => void) & { cancel: () => void };
}

export function useDebouncedCallback<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  return useMemo(() => debounce((...args: T) => fnRef.current(...args), ms), [ms]);
}
