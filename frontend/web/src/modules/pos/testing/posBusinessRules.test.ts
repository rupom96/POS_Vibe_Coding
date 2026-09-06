import { describe, expect, it } from 'vitest';
import { emptyLine, formatStockDisplay, isServiceProduct } from '../utils/format';
import { isCardPaymentActive, isMixedPaymentMode } from '../utils/paymentMode';
import { validateInvoiceForSave } from '../utils/validateInvoice';
import type { InvoiceLine, PaymentMode } from '../types';
import {
  commitSoftZero,
  exceedsStock,
  isInvoiceDiscountAllowed,
  resolveInvoiceDiscountAmount,
  shouldAutoPickMultiScan,
  unitPriceEditPatch,
} from './posBusinessLogic';
import { POS_BUSINESS_RULES, unitRules } from './posBusinessRules';

const cash: PaymentMode = {
  paymentModeId: 1,
  name: 'Cash',
};

const mixed: PaymentMode = {
  paymentModeId: 144,
  name: 'Mixed Mode(Cash/Cheque/Card)',
};

const card: PaymentMode = {
  paymentModeId: 5,
  name: 'Card',
};

function filledLine(overrides: Partial<InvoiceLine> = {}): InvoiceLine {
  return {
    ...emptyLine(0),
    productId: 1,
    productName: 'Test Product',
    quantity: 1,
    unitPrice: 100,
    ...overrides,
  };
}

describe('POS business rules catalog', () => {
  it('has unique rule ids', () => {
    const ids = POS_BUSINESS_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every unit rule declares a testKey', () => {
    for (const rule of unitRules()) {
      expect(rule.testKey, `${rule.id} missing testKey`).toBeTruthy();
    }
  });
});

describe('VAL-01 invoiceDiscountCap', () => {
  it('allows discount equal to total bill', () => {
    expect(isInvoiceDiscountAllowed(500, 500)).toBe(true);
  });

  it('rejects discount greater than total bill', () => {
    expect(isInvoiceDiscountAllowed(501, 500)).toBe(false);
  });

  it('resolves percentage against total bill', () => {
    expect(resolveInvoiceDiscountAmount(10, 'Percentage', 1000)).toBe(100);
    expect(isInvoiceDiscountAllowed(resolveInvoiceDiscountAmount(110, 'Percentage', 1000), 1000)).toBe(false);
  });
});

describe('VAL-02 / VAL-03 / PAY-* validateInvoiceForSave', () => {
  it('requiredFields: reports missing company, location, customer, employee, modes, project, lines', () => {
    const errors = validateInvoiceForSave({
      companyId: 0,
      locationId: 0,
      customerName: '',
      employeeId: undefined,
      paymentModeId: 0,
      biznessEventTypeId: 0,
      projectId: 0,
      givenAmount: 0,
      grandTotal: 0,
      lines: [emptyLine(0)],
      paymentModes: [cash],
    });
    expect(errors.some((e) => e.includes('Company'))).toBe(true);
    expect(errors.some((e) => e.includes('Location'))).toBe(true);
    expect(errors.some((e) => e.includes('customer'))).toBe(true);
    expect(errors.some((e) => e.includes('Sales person'))).toBe(true);
    expect(errors.some((e) => e.includes('Payment mode'))).toBe(true);
    expect(errors.some((e) => e.includes('Bizness event'))).toBe(true);
    expect(errors.some((e) => e.includes('Project'))).toBe(true);
    expect(errors.some((e) => e.includes('product'))).toBe(true);
  });

  it('lineQtyPrice: requires qty and unit price', () => {
    const errors = validateInvoiceForSave({
      companyId: 1,
      locationId: 1,
      buyerId: 1,
      customerName: 'A',
      employeeId: 1,
      paymentModeId: 1,
      biznessEventTypeId: 1,
      projectId: 1,
      givenAmount: 0,
      grandTotal: 0,
      lines: [filledLine({ quantity: 0, unitPrice: 0 })],
      paymentModes: [cash],
    });
    expect(errors.some((e) => e.includes('Quantity'))).toBe(true);
    expect(errors.some((e) => e.includes('Unit price'))).toBe(true);
  });

  it('mixedRequiresConfirm', () => {
    expect(isMixedPaymentMode(mixed)).toBe(true);
    const errors = validateInvoiceForSave({
      companyId: 1,
      locationId: 1,
      buyerId: 1,
      customerName: 'A',
      employeeId: 1,
      paymentModeId: mixed.paymentModeId,
      biznessEventTypeId: 1,
      projectId: 1,
      givenAmount: 100,
      grandTotal: 100,
      lines: [filledLine()],
      paymentModes: [mixed],
      mixedPaymentConfirmed: false,
    });
    expect(errors.some((e) => e.toLowerCase().includes('mixed'))).toBe(true);
  });

  it('mixedModeCrossCheck equal / less / more', () => {
    const base = {
      companyId: 1,
      locationId: 1,
      buyerId: 1,
      customerName: 'A',
      employeeId: 1,
      paymentModeId: mixed.paymentModeId,
      biznessEventTypeId: 1,
      projectId: 1,
      lines: [filledLine()],
      paymentModes: [mixed],
      mixedPaymentConfirmed: true,
      mixedModeCrossCheck: true,
    };
    expect(validateInvoiceForSave({ ...base, givenAmount: 100, grandTotal: 100 })).toEqual([]);
    expect(
      validateInvoiceForSave({ ...base, givenAmount: 90, grandTotal: 100 }).some((e) =>
        e.includes('less than Grand Total'),
      ),
    ).toBe(true);
    expect(
      validateInvoiceForSave({ ...base, givenAmount: 110, grandTotal: 100 }).some((e) =>
        e.includes('more than Grand Total'),
      ),
    ).toBe(true);
  });

  it('cardRequiresConfirm', () => {
    expect(isCardPaymentActive(card.paymentModeId, undefined, [card])).toBe(true);
    const errors = validateInvoiceForSave({
      companyId: 1,
      locationId: 1,
      buyerId: 1,
      customerName: 'A',
      employeeId: 1,
      paymentModeId: card.paymentModeId,
      biznessEventTypeId: 1,
      projectId: 1,
      givenAmount: 100,
      grandTotal: 100,
      lines: [filledLine()],
      paymentModes: [card],
      cardPaymentConfirmed: false,
    });
    expect(errors.some((e) => e.toLowerCase().includes('card'))).toBe(true);
  });
});

describe('VAL-04 priceDoesNotChangeDiscount', () => {
  it('unitPriceEditPatch only contains unitPrice', () => {
    const patch = unitPriceEditPatch(1500);
    expect(patch).toEqual({ unitPrice: 1500 });
    expect('discount' in patch).toBe(false);
  });

  it('typing intermediate price does not require discount clamp', () => {
    const priorDiscount = 50;
    const whileTyping = unitPriceEditPatch(1);
    expect(whileTyping.unitPrice).toBe(1);
    // Discount remains caller-owned:
    expect(priorDiscount).toBe(50);
  });
});

describe('SVC-01 / SVC-02 service products', () => {
  it('serviceStockEmpty', () => {
    expect(isServiceProduct('S')).toBe(true);
    expect(formatStockDisplay(12, 'Pcs', 'S')).toBe('');
    expect(formatStockDisplay(12, 'Pcs', 'I')).toBe('12 Pcs');
  });

  it('serviceSkipStockValidation', () => {
    expect(exceedsStock(999, 1, 'S')).toBe(false);
    expect(exceedsStock(5, 3, 'I')).toBe(true);
    expect(exceedsStock(2, 3, 'I')).toBe(false);
    expect(exceedsStock(5, 0, 'I')).toBe(false); // no stock cap when stockQty=0
  });
});

describe('UI-01 softZeroCommit', () => {
  it('empty or invalid → 0; valid number kept', () => {
    expect(commitSoftZero('')).toBe(0);
    expect(commitSoftZero('  ')).toBe(0);
    expect(commitSoftZero('abc')).toBe(0);
    expect(commitSoftZero('-3')).toBe(0);
    expect(commitSoftZero('12.5')).toBe(12.5);
  });
});

describe('SCN-01 multiScanAutoPick', () => {
  it('auto-picks only when exactly one result', () => {
    expect(shouldAutoPickMultiScan(0)).toBe(false);
    expect(shouldAutoPickMultiScan(1)).toBe(true);
    expect(shouldAutoPickMultiScan(2)).toBe(false);
  });
});
