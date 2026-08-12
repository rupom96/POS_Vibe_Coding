import { memo, useEffect, useRef, useState } from 'react';

/**
 * Number field that allows a temporary empty value while editing.
 * Min 0 is applied on blur (empty/invalid → 0), not on every keystroke.
 */
export const SoftZeroNumberInput = memo(function SoftZeroNumberInput({
  value,
  disabled,
  className = 'fv mono',
  onCommit,
}: {
  value: number;
  disabled?: boolean;
  className?: string;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(() => String(value ?? 0));
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setText(String(value ?? 0));
  }, [value]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    const num = Number(trimmed);
    const next = trimmed === '' || !Number.isFinite(num) || num < 0 ? 0 : num;
    onCommit(next);
    setText(String(next));
    return next;
  };

  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      value={text}
      disabled={disabled}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        commit(text);
      }}
      onChange={(e) => {
        const sanitized = e.target.value.replace(/[^0-9.]/g, '');
        setText(sanitized);

        // While editing, allow empty. Only push finite >= 0 values live.
        if (sanitized.trim() === '') return;
        const num = Number(sanitized);
        if (Number.isFinite(num) && num >= 0) onCommit(num);
      }}
    />
  );
});
