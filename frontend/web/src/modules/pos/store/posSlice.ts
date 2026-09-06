import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { posSession } from '../../../config/posSession';
import { createEmptyLines, emptyLine, formatStockDisplay, isLineEmpty, isServiceProduct, lineHasContent } from '../utils/format';
import type { CardPayment, CustomerSearchResult, InvoiceLine, LoadedInvoice, MixedModePayment } from '../types';
import type { PosDraftSnapshot } from '../offline/posSnapshot';
import { newLineId } from '../utils/format';

export interface CreateCustomerRequest {
  initial: string;
  name: string;
  phone: string;
  address?: string;
  remarks?: string;
  employeeId?: number;
  groupId?: number;
  companyId?: number;
  locationId?: number;
  entryBy?: number;
}

export type InvoiceDiscountType = 'Amount' | 'Percentage';

function nowLocalDateTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mapMixedCard(card: Record<string, unknown> | undefined) {
  if (!card) {
    return {
      amount: 0,
      cardNo: '',
      bank: '',
      expiryDate: nowLocalDateTime(),
      posMachine: false,
      charge: '',
      emiMode: 'non-emi' as const,
    };
  }
  const isEmi = card.emiMode === 'emi' || card.isEmi === true;
  return {
    amount: Number(card.amount) || 0,
    cardNo: String(card.cardNo ?? ''),
    bank: String(card.bank ?? ''),
    bankId: card.bankId as number | undefined,
    expiryDate: String(card.expiryDate || nowLocalDateTime()),
    posMachine: Boolean(card.posMachine),
    charge: String(card.charge ?? ''),
    posMachineBankId: card.posMachineBankId as number | undefined,
    posMachineBankName: card.posMachineBankName as string | undefined,
    cashBackOffer: (card.cashBackOffer ?? card.cashBackAmount) as number | undefined,
    emiMode: (isEmi ? 'emi' : 'non-emi') as 'emi' | 'non-emi',
    emiBankId: card.emiBankId as number | undefined,
    emiBankName: card.emiBankName as string | undefined,
    emiDurationId: (card.emiDurationId ?? card.emiId) as number | undefined,
    emiDeductionRate: (card.emiDeductionRate ?? card.emiDeductionPercentage) as number | undefined,
  };
}

function mapMixedPayment(raw: LoadedInvoice['mixedPayment']): MixedModePayment | undefined {
  if (!raw) return undefined;
  const cards = (raw.cards ?? []).map((c) => mapMixedCard(c as unknown as Record<string, unknown>));
  while (cards.length < 3) cards.push(mapMixedCard(undefined));
  return {
    cashAmount: raw.cashAmount,
    chequeAmount: raw.chequeAmount,
    chequeNo: raw.chequeNo ?? '',
    chequeBank: raw.chequeBank ?? '',
    chequeBankId: raw.chequeBankId,
    chequeDate: raw.chequeDate || nowLocalDateTime(),
    multiCard: raw.multiCard,
    cards: cards.slice(0, 3),
    confirmed: raw.confirmed,
  };
}

export interface PosFormState {
  buyerId?: number;
  customerName: string;
  customerCode: string;
  mobile: string;
  address: string;
  remarks: string;
  /** SalesOrder_Delivery.DeliveryAddress */
  deliveryAddress: string;
  invoiceNo: string;
  salesOrderNo: string;
  ledgerDue: number;
  paymentModeId: number;
  subPaymentModeId?: number;
  referenceId?: number;
  biznessEventTypeId: number;
  projectId: number;
  invoiceDate: string;
  /** SalesOrder.PaymentPromiseDate */
  paymentPromiseDate: string;
  employeeId: number;
  invoiceDiscount: number;
  invoiceDiscountType: InvoiceDiscountType;
  vatAit: number;
  othersCharge: number;
  givenAmount: number;
  mixedPayment?: MixedModePayment;
  cardPayment?: CardPayment;
  locationId: number;
  salesOrderId?: string;
  deletedLineIds: string[];
  pinnedRowIds: string[];
  lines: InvoiceLine[];
  sidebarOpen: boolean;
}

const initialState: PosFormState = {
  customerName: '',
  customerCode: '',
  mobile: '',
  address: '',
  remarks: '',
  deliveryAddress: '',
  invoiceNo: '',
  salesOrderNo: '',
  ledgerDue: 0,
  paymentModeId: 0,
  referenceId: undefined,
  biznessEventTypeId: 0,
  projectId: 0,
  invoiceDate: nowLocalDateTime(),
  paymentPromiseDate: nowLocalDateTime(),
  employeeId: posSession.employeeId,
  invoiceDiscount: 0,
  invoiceDiscountType: 'Amount',
  vatAit: 0,
  othersCharge: 0,
  givenAmount: 0,
  locationId: posSession.locationId,
  deletedLineIds: [],
  pinnedRowIds: [],
  lines: createEmptyLines(),
  sidebarOpen: false,
};

function reindexLines(lines: InvoiceLine[]) {
  lines.forEach((line, index) => {
    line.sortOrder = index;
  });
}

const posSlice = createSlice({
  name: 'pos',
  initialState,
  reducers: {
    setCustomer(state, action: PayloadAction<CustomerSearchResult & { ledgerDue?: number }>) {
      state.buyerId = action.payload.buyerId;
      state.customerName = action.payload.buyerName ?? action.payload.name ?? "";
      state.customerCode = action.payload.code ?? '';
      state.mobile = action.payload.phone ?? '';
      state.address = action.payload.address ?? '';
      state.ledgerDue = action.payload.ledgerDue ?? 0;
    },
    updateField<K extends keyof PosFormState>(state: PosFormState, action: PayloadAction<{ key: K; value: PosFormState[K] }>) {
      state[action.payload.key] = action.payload.value;
    },
    setLines(state, action: PayloadAction<InvoiceLine[]>) {
      state.lines = action.payload;
      reindexLines(state.lines);
    },
    updateLine(state, action: PayloadAction<{ id: string; patch: Partial<InvoiceLine> }>) {
      const line = state.lines.find((l) => l.id === action.payload.id);
      if (!line || line.rowStatus === 'deleted') return;
      Object.assign(line, action.payload.patch);
      if (line.rowStatus === 'clean' && line.salesOrderDetailId) {
        line.rowStatus = 'modified';
      }
    },
    addLine(state) {
      state.lines.push(emptyLine(state.lines.length));
    },
    ensureTrailingEmptyRow(state) {
      const visible = state.lines.filter((l) => l.rowStatus !== 'deleted');
      const last = visible[visible.length - 1];
      if (last && lineHasContent(last)) {
        state.lines.push(emptyLine(state.lines.length));
        reindexLines(state.lines);
      }
    },
    insertLineAtIndex(state, action: PayloadAction<{ index: number; id: string }>) {
      const visible = state.lines.filter((l) => l.rowStatus !== 'deleted');
      const idx = Math.max(0, Math.min(action.payload.index, visible.length));
      const line = emptyLine(idx);
      line.id = action.payload.id;
      visible.splice(idx, 0, line);
      const deleted = state.lines.filter((l) => l.rowStatus === 'deleted');
      state.lines = [...visible, ...deleted];
      reindexLines(state.lines);
    },
    markLineDeleted(state, action: PayloadAction<string>) {
      const line = state.lines.find((l) => l.id === action.payload);
      if (!line) return;

      if (line.salesOrderDetailId && !state.deletedLineIds.includes(line.salesOrderDetailId)) {
        state.deletedLineIds.push(line.salesOrderDetailId);
      }

      state.lines = state.lines.filter((l) => l.id !== action.payload);
      reindexLines(state.lines);

      const visible = state.lines.filter((l) => l.rowStatus !== 'deleted');
      if (!visible.length || !visible.some(isLineEmpty)) {
        state.lines.push(emptyLine(state.lines.length));
        reindexLines(state.lines);
      }
    },
    reorderLines(state, action: PayloadAction<{ from: number; to: number }>) {
      const visible = state.lines.filter((l) => l.rowStatus !== 'deleted');
      const { from, to } = action.payload;
      if (from < 0 || to < 0 || from >= visible.length || to >= visible.length) return;
      const [moved] = visible.splice(from, 1);
      visible.splice(to, 0, moved);
      const deleted = state.lines.filter((l) => l.rowStatus === 'deleted');
      state.lines = [...visible, ...deleted];
      reindexLines(state.lines);
    },
    toggleRowPin(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (state.pinnedRowIds.includes(id)) {
        state.pinnedRowIds = state.pinnedRowIds.filter((x) => x !== id);
      } else {
        state.pinnedRowIds.push(id);
      }
    },
    clearLines(state) {
      state.lines = createEmptyLines();
      state.deletedLineIds = [];
      state.pinnedRowIds = [];
    },
    resetPosForm: () => {
      const now = nowLocalDateTime();
      return {
        ...initialState,
        invoiceDate: now,
        paymentPromiseDate: now,
        lines: createEmptyLines(),
      };
    },
    clearLineTracking(state) {
      state.deletedLineIds = [];
      state.salesOrderId = undefined;
      state.lines = state.lines
        .filter((l) => l.rowStatus !== 'deleted' && lineHasContent(l))
        .map((l) => ({ ...l, rowStatus: 'clean' as const }));
      while (state.lines.filter((l) => l.rowStatus !== 'deleted').length < 10) {
        state.lines.push(emptyLine(state.lines.length));
      }
      reindexLines(state.lines);
    },
    toggleSidebar(state) {
      state.sidebarOpen = !state.sidebarOpen;
    },
    restoreSnapshot(state, action: PayloadAction<PosDraftSnapshot>) {
      const sidebarOpen = state.sidebarOpen;
      const snapshot = action.payload;
      state.buyerId = snapshot.buyerId;
      state.customerName = snapshot.customerName;
      state.customerCode = snapshot.customerCode ?? '';
      state.mobile = snapshot.mobile;
      state.address = snapshot.address;
      state.remarks = snapshot.remarks;
      state.deliveryAddress = snapshot.deliveryAddress ?? '';
      state.invoiceNo = snapshot.invoiceNo;
      state.ledgerDue = snapshot.ledgerDue;
      state.paymentModeId = snapshot.paymentModeId;
      state.subPaymentModeId = snapshot.subPaymentModeId;
      state.referenceId = snapshot.referenceId;
      state.biznessEventTypeId = snapshot.biznessEventTypeId ?? 0;
      state.projectId = snapshot.projectId ?? 0;
      state.invoiceDate = snapshot.invoiceDate;
      state.paymentPromiseDate =
        (snapshot.paymentPromiseDate && String(snapshot.paymentPromiseDate).slice(0, 16))
        || snapshot.invoiceDate
        || nowLocalDateTime();
      state.employeeId = snapshot.employeeId;
      state.invoiceDiscount = snapshot.invoiceDiscount;
      state.invoiceDiscountType = snapshot.invoiceDiscountType ?? 'Amount';
      state.vatAit = snapshot.vatAit;
      state.othersCharge = snapshot.othersCharge;
      state.givenAmount = snapshot.givenAmount;
      state.mixedPayment = snapshot.mixedPayment;
      state.cardPayment = snapshot.cardPayment;
      state.locationId = snapshot.locationId;
      state.salesOrderId = snapshot.salesOrderId;
      state.deletedLineIds = [...snapshot.deletedLineIds];
      state.pinnedRowIds = [...snapshot.pinnedRowIds];
      state.lines = snapshot.lines.map((line) => ({
        ...line,
        serials: line.serials.map((s) => ({ ...s })),
      }));
      state.sidebarOpen = sidebarOpen;
    },
    loadInvoice(state, action: PayloadAction<LoadedInvoice>) {
      const invoice = action.payload;
      state.salesOrderId = invoice.salesOrderId;
      state.invoiceNo = invoice.invoiceNo;
      state.salesOrderNo = invoice.salesOrderNo ?? '';
      state.buyerId = invoice.buyerId;
      state.customerName = invoice.customerName;
      state.customerCode = invoice.customerCode ?? '';
      state.mobile = invoice.mobile ?? '';
      state.address = invoice.address ?? '';
      state.remarks = invoice.remarks ?? '';
      state.deliveryAddress = invoice.deliveryAddress ?? '';
      state.referenceId = invoice.referenceId;
      state.biznessEventTypeId = invoice.biznessEventTypeId;
      state.projectId = invoice.projectId ?? 0;
      state.employeeId = invoice.employeeId;
      state.paymentModeId = invoice.paymentModeId;
      state.subPaymentModeId = invoice.subPaymentModeId;
      state.invoiceDate = invoice.invoiceDate.slice(0, 16);
      state.paymentPromiseDate = (invoice.paymentPromiseDate ?? invoice.invoiceDate).slice(0, 16);
      state.invoiceDiscount = invoice.invoiceDiscount;
      state.invoiceDiscountType = invoice.invoiceDiscountType === 'Percentage' ? 'Percentage' : 'Amount';
      state.vatAit = invoice.vatAit;
      state.othersCharge = invoice.othersCharge;
      state.givenAmount = invoice.givenAmount;
      state.ledgerDue = invoice.previousDues ?? 0;
      state.mixedPayment = mapMixedPayment(invoice.mixedPayment);
      state.cardPayment = invoice.cardPayment as CardPayment | undefined;
      state.deletedLineIds = [];
      state.pinnedRowIds = [];
      state.lines = invoice.lines.map((line, index) => ({
        id: newLineId(),
        salesOrderDetailId: line.salesOrderDetailId,
        rowStatus: 'clean' as const,
        productId: line.productId,
        productName: line.productName,
        modelNo: line.modelNo ?? '',
        stock: formatStockDisplay(line.stockQty, line.unitName, line.productType),
        stockQty: isServiceProduct(line.productType) ? 0 : line.stockQty,
        productType: line.productType,
        unit: line.unitName ?? 'Pcs',
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        warrantyDays: line.warrantyDays,
        vatPercent: line.vatPercent,
        taxPercent: line.taxPercent,
        isSerial: line.isSerial,
        serials: line.serials.map((s) => ({
          serialNo: s.serialNo,
          discount: s.discount,
          dbDiscount: s.discount,
        })),
        hasPriceSetup: line.hasPriceSetup !== false,
        sortOrder: index,
      }));
      while (state.lines.filter((l) => l.rowStatus !== 'deleted').length < 10) {
        state.lines.push(emptyLine(state.lines.length));
      }
      reindexLines(state.lines);
    },
    resetAfterSave(state, action: PayloadAction<{
      locationId: number;
      paymentModeId: number;
      invoiceNo: string;
      salesOrderId: string;
    }>) {
      state.buyerId = undefined;
      state.customerName = '';
      state.customerCode = '';
      state.mobile = '';
      state.address = '';
      state.remarks = '';
      state.deliveryAddress = '';
      state.invoiceNo = action.payload.invoiceNo;
      state.salesOrderId = action.payload.salesOrderId;
      state.ledgerDue = 0;
      state.referenceId = undefined;
      state.biznessEventTypeId = 0;
      state.projectId = 0;
      state.invoiceDiscount = 0;
      state.invoiceDiscountType = 'Amount';
      state.vatAit = 0;
      state.othersCharge = 0;
      state.givenAmount = 0;
      state.mixedPayment = undefined;
      state.cardPayment = undefined;
      state.lines = createEmptyLines();
      state.deletedLineIds = [];
      state.pinnedRowIds = [];
      state.employeeId = 0;
      state.locationId = action.payload.locationId;
      state.paymentModeId = action.payload.paymentModeId;
      state.subPaymentModeId = undefined;
    },
  },
});

export const {
  setCustomer,
  updateField,
  setLines,
  updateLine,
  addLine,
  insertLineAtIndex,
  ensureTrailingEmptyRow,
  markLineDeleted,
  reorderLines,
  toggleRowPin,
  clearLines,
  resetPosForm,
  clearLineTracking,
  toggleSidebar,
  restoreSnapshot,
  loadInvoice,
  resetAfterSave,
} = posSlice.actions;

export default posSlice.reducer;
