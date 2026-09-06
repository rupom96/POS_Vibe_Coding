import type { InvoiceLine, PaymentMode } from '../types';
import { isLineFilled } from './format';
import { isCardPaymentActive, isMixedPaymentMode } from './paymentMode';

export interface ValidateInvoiceInput {
  companyId: number;
  locationId: number;
  buyerId?: number;
  customerName: string;
  employeeId?: number;
  paymentModeId: number;
  biznessEventTypeId: number;
  projectId: number;
  givenAmount: number;
  grandTotal: number;
  lines: InvoiceLine[];
  paymentModes: PaymentMode[];
  subPaymentModeId?: number;
  mixedPaymentConfirmed?: boolean;
  cardPaymentConfirmed?: boolean;
  mixedModeCrossCheck?: boolean;
}

export function validateInvoiceForSave(input: ValidateInvoiceInput): string[] {
  const errors: string[] = [];
  const activeLines = input.lines.filter((line) => line.rowStatus !== 'deleted' && isLineFilled(line));

  if (!input.companyId || input.companyId <= 0) {
    errors.push('Company is required');
  }

  if (!input.locationId || input.locationId <= 0) {
    errors.push('Location is required');
  }

  if (!input.buyerId) {
    errors.push('Select or create a customer before saving');
  }

  if (!input.employeeId) {
    errors.push('Sales person is required');
  }

  if (!input.paymentModeId || input.paymentModeId <= 0) {
    errors.push('Payment mode is required');
  }

  if (!input.biznessEventTypeId || input.biznessEventTypeId <= 0) {
    errors.push('Bizness event type is required');
  }

  if (!input.projectId || input.projectId <= 0) {
    errors.push('Project is required');
  }

  if (!activeLines.length) {
    errors.push('Add at least one product');
  }

  for (const line of activeLines) {
    const label = line.productName || 'product';
    if (line.quantity <= 0) {
      errors.push(`Quantity is required for ${label}`);
    }
    if (line.unitPrice <= 0) {
      errors.push(`Unit price is required for ${label}`);
    }
  }

  const payMode = input.paymentModes.find((mode) => mode.paymentModeId === input.paymentModeId);
  const isMixed = isMixedPaymentMode(payMode ?? null);
  const isCard = isCardPaymentActive(input.paymentModeId, input.subPaymentModeId, input.paymentModes);

  if (isMixed && !input.mixedPaymentConfirmed) {
    errors.push('Complete mixed payment details');
  }

  if (isCard && !input.cardPaymentConfirmed) {
    errors.push('Complete card payment details');
  }

  // When MixedModeCrossCheck is on, Total Paid must equal Grand Total.
  if (isMixed && input.mixedPaymentConfirmed && input.mixedModeCrossCheck) {
    const diff = Math.round((input.givenAmount - input.grandTotal) * 100) / 100;
    if (diff < 0) {
      errors.push('Paid Amount is less than Grand Total');
    } else if (diff > 0) {
      errors.push('Paid Amount is more than Grand Total');
    }
  }

  return errors;
}

export function formatValidationErrors(errors: string[]): string {
  if (errors.length <= 1) return errors[0] ?? '';
  return errors.map((error, index) => `${index + 1}. ${error}`).join('\n');
}
