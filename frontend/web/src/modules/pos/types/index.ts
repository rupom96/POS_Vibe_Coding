export type LineRowStatus = 'new' | 'clean' | 'modified' | 'deleted';

export interface Location {
  locationId: number;
  name: string;
  code?: string;
}

export interface PaymentMode {
  paymentModeId: number;
  name: string;
  parentId?: number;
  parentName?: string;
}

export const isSubPaymentMode = (mode: PaymentMode) => (mode.parentId ?? 0) > 0;

export interface MixedCardPayment {
  amount: number;
  cardNo: string;
  bank: string;
  bankId?: number;
  expiryDate: string;
  posMachine: boolean;
  /** Numeric charge without % suffix when POSMachineChargeFromBankSetup; else may be "0.5%". */
  charge: string;
  posMachineBankId?: number;
  posMachineBankName?: string;
  cashBackOffer?: number;
  /** 'emi' | 'non-emi' */
  emiMode: 'emi' | 'non-emi';
  emiBankId?: number;
  emiBankName?: string;
  emiDurationId?: number;
  emiDeductionRate?: number;
}

export interface MixedModePayment {
  cashAmount: number;
  chequeAmount: number;
  chequeNo: string;
  chequeBank: string;
  chequeBankId?: number;
  chequeDate: string;
  multiCard: boolean;
  cards: MixedCardPayment[];
  confirmed: boolean;
}

export interface CardPayment {
  cardNo: string;
  bank: string;
  bankId?: number;
  expiryDate: string;
  posMachine: boolean;
  charge: string;
  confirmed: boolean;
}

export interface BankOption {
  bankId: number;
  bankName: string;
}

export interface BankExpenseCharge {
  creditCardChargeP: number;
  posMachineChargeP: number;
  cashBackAmount: number;
}

export interface CardEmiDeduction {
  cardEmiDeductionId: number;
  noOfInstallment: number;
  deductionRate: number;
}

export interface PosFeatureFlags {
  loginUserWiseSalesPersonSet: boolean;
  salesOrderEnableSalesPerson: boolean;
  mixedModeCrossCheck: boolean;
  backDateEntrySales: boolean;
  salesWithoutPriceSetup: boolean;
  cashBackOffer: boolean;
  posMachineChargeFromBankSetup: boolean;
  /** True only when BRFeature PosSalesEdit is on AND SecurityMenu_User grants POSNEW edit path. */
  posSalesEdit: boolean;
  /** When true, same product may appear on multiple invoice lines (merge offered on same price). */
  posMultiplePriceSales: boolean;
  /** Administration department + Administrator level only. */
  canViewProductCost: boolean;
  /** When true, pay mode comes from Buyer_AgreementCredit.PreferredPaymentModeId for the selected customer. */
  restrictedPaymentModeInPos: boolean;
}

export interface BuyerPreferredPaymentMode {
  paymentModeId?: number;
  subPaymentModeId?: number;
}

export interface BiznessEventTypeOption {
  biznessEventTypeId: number;
  name: string;
}

export interface ProjectOption {
  projectId: number;
  name: string;
}

export interface BuyerGroupOption {
  buyerGroupId: number;
  name: string;
  code?: string;
}

export interface SalesPerson {
  employeeId: number;
  name: string;
}

export interface ReferenceOption {
  allCompanyId: number;
  name: string;
}

export interface CustomerSearchResult {
  buyerId: number;
  buyerName?: string;
  name?: string;
  code?: string;
  phone?: string;
  address?: string;
  employeeId?: number;
  employeeName?: string;
}

export interface Customer {
  buyerId: number;
  name: string;
  buyerName?: string;
  code?: string;
  phone?: string;
  address?: string;
  employeeId?: number;
  employeeName?: string;
  initial?: string;
  remarks?: string;
  ledgerDue: number;
  salesPersonName?: string;
}

export interface CustomerStats {
  customerName: string;
  sinceYear: number;
  invoiceCount: number;
  totalSales: number;
  totalCollected: number;
  ledgerDue: number;
  lastPurchaseDate?: string;
  averageOrder: number;
}

export interface ProductSearchResult {
  productId: number;
  name: string;
  modelNo?: string;
  barcode?: string;
  groupName?: string;
  isSerial: boolean;
  productType?: string;
}

export interface ProductDetail {
  productId: number;
  name: string;
  modelNo?: string;
  barcode?: string;
  unitName?: string;
  stockQty: number;
  lastPrice: number;
  isSerial: boolean;
  warrantyDays: number;
  costMin?: number;
  costMax?: number;
  costAvg?: number;
  /** True when CurrentStock has at least one row for this product (qty may be 0). */
  hasCurrentStock?: boolean;
  productType?: string;
  hasPriceSetup: boolean;
}

export interface PriceHistoryItem {
  label: string;
  value: number;
}

export interface ProductPriceQuote {
  price: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
}

export interface ProductTreeNode {
  id: string;
  label: string;
  icon: string;
  isModel: boolean;
  bold: boolean;
  open: boolean;
  children: ProductTreeNode[];
}

export type ProductTreeSearchFilter = 'all' | 'group' | 'category' | 'brand' | 'product' | 'serial';

export interface ProductTreeSearchResult {
  id: string;
  label: string;
  matchType: ProductTreeSearchFilter;
  path: string;
  icon: string;
  productId?: number;
  expandIds: string[];
}

export interface ProductSerialOption {
  serialNo: string;
  discountAmount: number;
}

export interface ResolveSerialSequenceResult {
  found: ProductSerialOption[];
  missing: string[];
}

export interface SerialEntry {
  serialNo: string;
  discount: number;
  dbDiscount: number;
}

export interface SerialModalResult {
  serials: SerialEntry[];
  warrantyDays: number;
  quantity: number;
  lineDiscount: number;
}

export interface InvoiceLine {
  id: string;
  salesOrderDetailId?: string;
  rowStatus: LineRowStatus;
  productId?: number;
  productName: string;
  modelNo: string;
  stock: string;
  stockQty: number;
  /** Product.ProductType — 'S' = service (no stock). */
  productType?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  /** Allowed override floor from PriceType.DecreasePercent (set when list price is fetched). */
  unitPriceMin?: number;
  /** Allowed override ceiling from PriceType.IncreasePercent (set when list price is fetched). */
  unitPriceMax?: number;
  discount: number;
  warrantyDays: number;
  vatPercent: number;
  taxPercent: number;
  isSerial: boolean;
  serials: SerialEntry[];
  sortOrder: number;
  /** True when Product has at least one Price row. */
  hasPriceSetup?: boolean;
}

export interface SaveInvoiceLineRequest {
  salesOrderDetailId?: string;
  productId: number;
  quantity: number;
  unitPrice: number;
  discount: number;
  warrantyDays: number;
  vatPercent: number;
  taxPercent: number;
  serials?: { serialNo: string; discount: number }[];
}

export interface SaveInvoiceMixedCardRequest {
  amount: number;
  cardNo: string;
  bank: string;
  bankId?: number;
  expiryDate?: string;
  posMachine: boolean;
  charge?: string;
  posMachineBankId?: number;
  cashBackAmount?: number;
  isEmi?: boolean;
  emiBankId?: number;
  emiId?: number;
  emiDeductionPercentage?: number;
}

export interface SaveInvoiceMixedPaymentRequest {
  cashAmount: number;
  chequeAmount: number;
  chequeNo?: string;
  chequeBank?: string;
  chequeBankId?: number;
  chequeDate?: string;
  multiCard: boolean;
  cards: SaveInvoiceMixedCardRequest[];
  confirmed: boolean;
}

export interface SaveInvoiceCardPaymentRequest {
  cardNo: string;
  bank: string;
  bankId?: number;
  expiryDate?: string;
  posMachine: boolean;
  charge?: string;
  confirmed: boolean;
}

export interface SaveInvoiceRequest {
  companyId: number;
  salesOrderId?: string;
  buyerId?: number;
  customerName?: string;
  mobile?: string;
  address?: string;
  remarks?: string;
  /** SalesOrder_Delivery.DeliveryAddress — insert on create; update on edit */
  deliveryAddress?: string;
  locationId: number;
  paymentModeId: number;
  subPaymentModeId?: number;
  referenceId?: number;
  biznessEventTypeId: number;
  projectId: number;
  employeeId: number;
  entryBy: number;
  /** Session login user name — written to SalesOrderDetail.PriceTakenBy on new lines. */
  entryByUserName?: string;
  invoiceDate: string;
  /** Maps to SalesOrder.PaymentPromiseDate */
  paymentPromiseDate?: string;
  /** Buyer ledger due at save — SalesOrder.PreviousDues & Collection_Invoice.PreviousDue */
  previousDues?: number;
  invoiceDiscount: number;
  invoiceDiscountType?: string;
  vatAit: number;
  othersCharge: number;
  givenAmount: number;
  payModeName?: string;
  mixedPayment?: SaveInvoiceMixedPaymentRequest;
  cardPayment?: SaveInvoiceCardPaymentRequest;
  lines: SaveInvoiceLineRequest[];
  deletedLineIds?: string[];
}

export interface SaveInvoiceResponse {
  salesOrderId: string;
  invoiceNo: string;
  salesOrderNo: string;
  grandTotal: number;
  changeAmount: number;
  message: string;
}

export interface NextInvoice {
  invoiceNo: string;
  salesOrderNo: string;
}

export interface InvoiceSearchResult {
  invoiceNo: string;
  salesOrderId: string;
  invoiceDate?: string;
  customerName?: string;
}

export interface TodayInvoiceListItem {
  invoiceNo: string;
  salesOrderId: string;
  invoiceDate?: string;
  customerName?: string;
  itemCount: number;
  grandTotal: number;
  status: string;
}

export interface LoadedInvoiceSerial {
  serialNo: string;
  discount: number;
}

export interface LoadedInvoiceLine {
  salesOrderDetailId: string;
  productId: number;
  productName: string;
  modelNo?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  warrantyDays: number;
  vatPercent: number;
  taxPercent: number;
  isSerial: boolean;
  unitName?: string;
  stockQty: number;
  productType?: string;
  serials: LoadedInvoiceSerial[];
  hasPriceSetup?: boolean;
}

export interface CompanyLetterhead {
  companyId: number;
  name: string;
  address?: string | null;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  url?: string | null;
}

export interface InvoicePrintContext {
  company: CompanyLetterhead;
  invoiceNo: string;
  salesOrderNo: string;
  billingByName?: string | null;
  verifiedByName?: string | null;
  /** Sum of Collection.CollectedAmount for this InvoiceNo where Approved = 'Y'. */
  collectedAmount: number;
  /** SalesOrder.TotalAmount (invoice sales amount). */
  salesAmount: number;
  /** TempLedgerDue.PreviousDue via SP_PosSalesLedgerDue (Invoice Report / Invoice POS). */
  previousDue?: number;
}

export interface LoadedInvoice {
  salesOrderId: string;
  invoiceNo: string;
  salesOrderNo: string;
  buyerId: number;
  customerName: string;
  customerCode?: string;
  mobile?: string;
  address?: string;
  remarks?: string;
  /** From SalesOrder_Delivery.DeliveryAddress for this SalesOrderId */
  deliveryAddress?: string;
  referenceId?: number;
  biznessEventTypeId: number;
  projectId?: number;
  employeeId: number;
  paymentModeId: number;
  subPaymentModeId?: number;
  invoiceDate: string;
  /** SalesOrder.PaymentPromiseDate */
  paymentPromiseDate?: string;
  invoiceDiscount: number;
  invoiceDiscountType?: string;
  vatAit: number;
  othersCharge: number;
  givenAmount: number;
  grandTotal: number;
  /** SalesOrder.PreviousDues — ledger due at time of save (edit load only). */
  previousDues?: number;
  mixedPayment?: SaveInvoiceMixedPaymentRequest;
  cardPayment?: SaveInvoiceCardPaymentRequest;
  lines: LoadedInvoiceLine[];
}

export interface MultiScanSerialItem {
  productId: number;
  productName: string;
  serialNo: string;
  discountAmount: number;
}

export interface MultiScanResult {
  type: string;
  customer?: CustomerSearchResult;
  product?: ProductDetail;
  invoiceNo?: string;
  serial?: MultiScanSerialItem;
  salesPerson?: SalesPerson;
}

export interface MultiScanSearchItem {
  type: string;
  key: string;
  label: string;
  subLabel?: string;
  customer?: CustomerSearchResult;
  productId?: number;
  invoiceNo?: string;
  serial?: MultiScanSerialItem;
  salesPerson?: SalesPerson;
}

export interface TablePrefs {
  columnOrder: string[];
  columnVisibility: Record<string, boolean>;
  columnPinning: { left?: string[]; right?: string[] };
  columnSizing: Record<string, number>;
  sorting: { id: string; desc: boolean }[];
  columnFilters: { id: string; value: string }[];
  globalFilter: string;
  density: 'compact' | 'comfortable';
}
