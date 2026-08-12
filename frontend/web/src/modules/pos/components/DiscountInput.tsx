import { memo, useEffect, useRef, useState } from 'react';
import type { InvoiceDiscountType } from '../store/posSlice';

function display(value: number, type: InvoiceDiscountType): string {
  if (!value) return '';
  return type === 'Percentage' ? `${value}%` : `${value}`;
}

/**
 * Discount field: a plain number saves as an "Amount" discount, while a value
 * suffixed with "%" (e.g. "38%") saves as a "Percentage" discount.
 */
export const DiscountInput = memo(function DiscountInput({
  value,
  type,
  disabled,
  maxAmount,
  onChange,
  onExceedTotalBill,
}: {
  value: number;
  type: InvoiceDiscountType;
  disabled?: boolean;
  /** When set, amount discounts cannot exceed this (Total bill). */
  maxAmount?: number;
  onChange: (value: number, type: InvoiceDiscountType) => void;
  onExceedTotalBill?: () => void;
}) {
  const [text, setText] = useState(() => display(value, type));
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setText(display(value, type));
  }, [value, type]);

  const handleChange = (raw: string) => {
    const sanitized = raw.replace(/[^0-9.%]/g, '');
    setText(sanitized);

    const trimmed = sanitized.trim();
    if (!trimmed) {
      onChange(0, 'Amount');
      return;
    }

    const isPercent = trimmed.includes('%');
    const numPart = trimmed.replace(/%/g, '');
    let num = Number(numPart);
    if (!Number.isFinite(num) || num < 0) num = 0;
    if (isPercent && num > 100) num = 100;

    if (!isPercent && maxAmount !== undefined && num > maxAmount) {
      onExceedTotalBill?.();
      num = Math.max(0, maxAmount);
      setText(num ? String(num) : '');
    }

    onChange(num, isPercent ? 'Percentage' : 'Amount');
  };

  return (
    <input
      className="fv mono"
      type="text"
      inputMode="decimal"
      value={text}
      disabled={disabled}
      placeholder="0  (or 38%)"
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setText(display(value, type));
      }}
      onChange={(e) => handleChange(e.target.value)}
    />
  );
});
