/**
 * POS acceptance catalog — business rules requested/implemented in this project.
 * Automated tests cover rules with `verify: 'unit'`.
 * Rules with `verify: 'integration'` need API/DB or UI E2E (listed for manual/CI later).
 */

export type RuleArea =
  | 'DocumentNumbers'
  | 'Vouchers'
  | 'Payments'
  | 'Stock'
  | 'ServiceProducts'
  | 'UI'
  | 'Validation'
  | 'Customers'
  | 'Scanning';

export type RuleVerify = 'unit' | 'integration';

export interface PosBusinessRule {
  id: string;
  area: RuleArea;
  title: string;
  description: string;
  verify: RuleVerify;
  /** Pure helper / test name when verify=unit */
  testKey?: string;
}

export const POS_BUSINESS_RULES: PosBusinessRule[] = [
  // —— Document numbers ——
  {
    id: 'DOC-01',
    area: 'DocumentNumbers',
    title: 'Invoice / SalesOrder / Collection numbers from BiznessEvent',
    description:
      'Numbers are generated from BiznessEvent → EventNoFormat tags (INITIAL, COMPANY, LOCATION, YEAR, Number, etc.) via serial tables.',
    verify: 'integration',
  },
  {
    id: 'DOC-02',
    area: 'DocumentNumbers',
    title: 'Mixed-mode CollectionNo uses Cash/Cheque/Card mode, not Mixed parent',
    description:
      'Each mixed collection plan generates CollectionNo with plan.CollectionModeId so USER/DATABIZ is not injected from Mixed EventNoFormat.',
    verify: 'integration',
  },
  {
    id: 'DOC-03',
    area: 'DocumentNumbers',
    title: 'BuyerNo / SupplierNo from BiznessEvent (company+location only)',
    description: 'Customer/Supplier codes do not filter by payment mode / event type.',
    verify: 'integration',
  },

  // —— Vouchers ——
  {
    id: 'VCH-01',
    area: 'Vouchers',
    title: 'TMP_VoucherGeneration on approved Invoice save',
    description: 'When SalesOrder Approved=Y, insert TMP row BiznessEventName=Invoice with EventNo=InvoiceNo.',
    verify: 'integration',
  },
  {
    id: 'VCH-02',
    area: 'Vouchers',
    title: 'TMP_VoucherGeneration on approved Collection create',
    description: 'One TMP Collection row per approved collection (e.g. cash auto-approve).',
    verify: 'integration',
  },
  {
    id: 'VCH-03',
    area: 'Vouchers',
    title: 'Invoice edit: unpost + cancel vouchers, delete PostedTransaction only',
    description:
      'Posted=NULL, PostedBy=NULL, PostingDate=NULL; Cancelled=1, CancelledBy=session user, CancelledDate=now; delete PostedTransaction; keep Voucher + VoucherDetail.',
    verify: 'integration',
  },
  {
    id: 'VCH-04',
    area: 'Vouchers',
    title: 'Invoice edit: clear SalesOrder and Collection VoucherId',
    description: 'SalesOrder.VoucherId and linked Collection.VoucherId set NULL on edit reset.',
    verify: 'integration',
  },
  {
    id: 'VCH-05',
    area: 'Vouchers',
    title: 'Invoice edit: delete TMP by InvoiceNo/CollectionNo then re-insert after save',
    description: 'TMP_VoucherGeneration.EventNo matches cleared; fresh rows after approved save.',
    verify: 'integration',
  },

  // —— Payments ——
  {
    id: 'PAY-01',
    area: 'Payments',
    title: 'MixedModeCrossCheck: Total Paid must equal Grand Total',
    description: 'When feature on, reject paid < or > grand total; no change/overpay flow.',
    verify: 'unit',
    testKey: 'mixedModeCrossCheck',
  },
  {
    id: 'PAY-02',
    area: 'Payments',
    title: 'Mixed mode requires confirmed mixed payment details',
    description: 'Cannot save mixed invoice without MixedPayment.Confirmed.',
    verify: 'unit',
    testKey: 'mixedRequiresConfirm',
  },
  {
    id: 'PAY-03',
    area: 'Payments',
    title: 'Card mode requires confirmed card payment details',
    description: 'Cannot save card invoice without CardPayment.Confirmed.',
    verify: 'unit',
    testKey: 'cardRequiresConfirm',
  },

  // —— Stock ——
  {
    id: 'STK-01',
    area: 'Stock',
    title: 'Edit load: available stock = current + qty already on invoice',
    description: 'Loaded invoice lines add reserved qty so user can keep existing quantities.',
    verify: 'integration',
  },
  {
    id: 'STK-02',
    area: 'Stock',
    title: 'Edit qty decrease: new CurrentStock row (not update lot)',
    description: 'PurchaseId + SalesOrderNo = SalesOrderNo; StockInType SO.',
    verify: 'integration',
  },
  {
    id: 'STK-03',
    area: 'Stock',
    title: 'New/edit qty increase: FIFO deduct from CurrentStock',
    description: 'Insufficient stock throws on non-service products.',
    verify: 'integration',
  },

  // —— Service products ——
  {
    id: 'SVC-01',
    area: 'ServiceProducts',
    title: 'ProductType S: Stock column empty',
    description: 'formatStockDisplay returns empty string for ProductType S.',
    verify: 'unit',
    testKey: 'serviceStockEmpty',
  },
  {
    id: 'SVC-02',
    area: 'ServiceProducts',
    title: 'ProductType S: skip qty ≤ stock validation',
    description: 'isServiceProduct lines are not stock-capped.',
    verify: 'unit',
    testKey: 'serviceSkipStockValidation',
  },
  {
    id: 'SVC-03',
    area: 'ServiceProducts',
    title: 'ProductType S: no CurrentStock insert/update on save/edit',
    description: 'PosStockService skips deduct/stock-in for ProductType S.',
    verify: 'integration',
  },

  // —— Validation ——
  {
    id: 'VAL-01',
    area: 'Validation',
    title: 'Inv. discount cannot be greater than Total bill',
    description: 'Amount (or % equivalent) discountAmount must be ≤ line Total bill.',
    verify: 'unit',
    testKey: 'invoiceDiscountCap',
  },
  {
    id: 'VAL-02',
    area: 'Validation',
    title: 'Save requires customer, sales person, payment mode, event type, project, lines',
    description: 'validateInvoiceForSave collects required-field errors.',
    verify: 'unit',
    testKey: 'requiredFields',
  },
  {
    id: 'VAL-03',
    area: 'Validation',
    title: 'Line qty and unit price required when filled',
    description: 'Active lines need quantity > 0 and unitPrice > 0.',
    verify: 'unit',
    testKey: 'lineQtyPrice',
  },
  {
    id: 'VAL-04',
    area: 'Validation',
    title: 'Editing unit price must not change line discount',
    description: 'Price onChange patches only unitPrice; discount persists until user edits discount.',
    verify: 'unit',
    testKey: 'priceDoesNotChangeDiscount',
  },

  // —— UI ——
  {
    id: 'UI-01',
    area: 'UI',
    title: 'VAT/AIT & Others Charge: clearable while typing; empty → 0 on blur',
    description: 'SoftZeroNumberInput commits 0 only when empty/invalid on blur.',
    verify: 'unit',
    testKey: 'softZeroCommit',
  },
  {
    id: 'UI-02',
    area: 'UI',
    title: 'Toast auto-hide pauses on hover and resumes on leave',
    description: 'Remaining time preserved while pointer is over toast.',
    verify: 'integration',
  },
  {
    id: 'UI-03',
    area: 'UI',
    title: 'Autocomplete: focus with selection shows all options; selected highlighted',
    description: 'Customer/product/etc. browse-all on focus when value selected.',
    verify: 'integration',
  },
  {
    id: 'UI-04',
    area: 'UI',
    title: 'Customer stats tip: hover only (not focus); hide on unhover',
    description: 'Performance popup only while hovering selected customer field.',
    verify: 'integration',
  },
  {
    id: 'UI-05',
    area: 'UI',
    title: 'BackDateEntrySales: Inv. Date editable only when feature allowed',
    description: 'Invoice datetime-local readOnly unless feature flag.',
    verify: 'integration',
  },

  // —— Customers ——
  {
    id: 'CUS-01',
    area: 'Customers',
    title: 'Quick Customer Setup: Enter submits Save Customer',
    description: 'Form submit / Remarks Enter triggers save (no newline in remarks).',
    verify: 'integration',
  },

  // —— Scanning ——
  {
    id: 'SCN-01',
    area: 'Scanning',
    title: 'Multi Scan: single search result auto-loads',
    description: 'If search returns exactly one option, pick it without manual select (scanner Enter / debounce).',
    verify: 'unit',
    testKey: 'multiScanAutoPick',
  },
];

export function rulesByArea(area: RuleArea) {
  return POS_BUSINESS_RULES.filter((r) => r.area === area);
}

export function unitRules() {
  return POS_BUSINESS_RULES.filter((r) => r.verify === 'unit');
}

export function integrationRules() {
  return POS_BUSINESS_RULES.filter((r) => r.verify === 'integration');
}
