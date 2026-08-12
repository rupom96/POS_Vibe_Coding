import type { PaymentMode } from '../types';

export function isMixedPaymentMode(mode: PaymentMode | null | undefined): boolean {
  return !!mode?.name && /mixed\s*mode/i.test(mode.name);
}

export function isCardPaymentMode(mode: PaymentMode | null | undefined): boolean {
  if (!mode?.name || isMixedPaymentMode(mode)) return false;
  return /\bcard\b/i.test(mode.name);
}

export function isCardPaymentActive(
  paymentModeId: number,
  subPaymentModeId: number | undefined,
  modes: PaymentMode[],
): boolean {
  const payMode = modes.find((m) => m.paymentModeId === paymentModeId);
  if (isCardPaymentMode(payMode ?? null)) return true;
  if (!subPaymentModeId) return false;
  const sub = modes.find((m) => m.paymentModeId === subPaymentModeId);
  if (!sub?.parentId) return false;
  const parent = modes.find((m) => m.paymentModeId === sub.parentId);
  return isCardPaymentMode(parent ?? null);
}

export function localDateTimeInputValue(date = new Date()): string {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
