import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionsPanel } from '../components/bottom/ActionsPanel';
import { PaymentPanel } from '../components/bottom/PaymentPanel';
import { SummaryPanel, useInvoiceTotals } from '../components/bottom/SummaryPanel';
import { CustomerSearchInput } from '../components/CustomerSearchInput';
import { DiscountInput } from '../components/DiscountInput';
import { SoftZeroNumberInput } from '../components/SoftZeroNumberInput';
import { InvoiceSearchInput } from '../components/InvoiceSearchInput';
import { ReferenceSearchInput } from '../components/ReferenceSearchInput';
import { SalesPersonSearchInput } from '../components/SalesPersonSearchInput';
import { CustomerStatsTip } from '../components/CustomerStatsTip';
import { PriceHistoryTip } from '../components/PriceHistoryTip';
import { useToast } from '../../../shared/components/Toast';
import { posSession } from '../../../config/posSession';
import { PosItemsTable } from '../components/grid/PosItemsTable';
import { SerialModal } from '../components/modals/SerialModal';
import { StatusBar } from '../components/layout/StatusBar';
import { TreeSidebar } from '../components/layout/TreeSidebar';
import { PosToolbar } from '../components/layout/PosToolbar';
import { MultiScanPickModal } from '../components/modals/MultiScanPickModal';
import { ScanModal } from '../components/modals/ScanModal';
import { ExchangeModal } from '../components/modals/ExchangeModal';
import { MoreActionsModal } from '../components/modals/MoreActionsModal';
import { InvoiceReportModal } from '../components/modals/InvoiceReportModal';
import { InvoicePosPrintModal } from '../components/modals/InvoicePosPrintModal';
import { DeliveryChallanModal } from '../components/modals/DeliveryChallanModal';
import { HoldInvoiceModal } from '../components/modals/HoldInvoiceModal';
import { TodayInvoiceListModal } from '../components/modals/TodayInvoiceListModal';
import { CustomerSetupModal } from '../components/modals/CustomerSetupModal';
import { CardPaymentModal } from '../components/modals/CardPaymentModal';
import { MixedModeModal } from '../components/modals/MixedModeModal';
import {
  useCreateCustomerMutation,
  useGetCustomerStatsQuery,
  useGetHealthQuery,
  useGetPaymentModesQuery,
  useGetProductTreeQuery,
  useGetBanksQuery,
  useGetPosFeaturesQuery,
  useGetBiznessEventTypesQuery,
  useGetProjectsQuery,
  useGetReferencesQuery,
  useGetSalesPersonsQuery,
  useLazyGetCustomerLedgerDueQuery,
  useLazyGetPriceHistoryQuery,
  useLazyGetProductQuery,
  useLazyGetProductPriceQuery,
  useLazySearchProductsQuery,
  useLazyMultiScanQuery,
  useLazySearchMultiScanQuery,
  useLazyGetInvoiceQuery,
  useLazySearchInvoicesQuery,
  useSaveInvoiceMutation,
} from '../api/posApi';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import {
  resetPosForm,
  ensureTrailingEmptyRow,
  insertLineAtIndex,
  markLineDeleted,
  loadInvoice,
  restoreSnapshot,
  setCustomer,
  toggleSidebar,
  updateField,
  updateLine,
} from '../store/posSlice';
import type { InvoiceDiscountType } from '../store/posSlice';
import { clearPosDraft, usePosDraftPersistence } from '../hooks/usePosDraftPersistence';
import { confirmHoldInvoice } from '../offline/holdInvoiceDialog';
import {
  addHeldInvoice,
  getHeldInvoice,
  listHeldInvoices,
  removeHeldInvoice,
} from '../offline/posOfflineStorage';
import { hasSnapshotContent, toSnapshot } from '../offline/posSnapshot';
import type { HeldInvoiceRecord } from '../offline/posDb';
import type { CardPayment, CustomerSearchResult, InvoiceLine, InvoiceSearchResult, MixedModePayment, MultiScanResult, MultiScanSearchItem, MultiScanSerialItem, PaymentMode, ProductDetail, ProductSearchResult, ReferenceOption, SalesPerson, SaveInvoiceResponse } from '../types';
import { generateId } from '../../../shared/utils/generateId';
import { connectPosRelay, setRemoteArmState } from '../utils/scanRelay';
import { REMOTE_FEED_TIMEOUT_MS } from '../utils/remotePreview';
import { HubConnectionState, type HubConnection } from '@microsoft/signalr';
import { isSubPaymentMode } from '../types';
import { calcLineTotal, formatCurrency, formatNumber, formatStockDisplay, isLineFilled, isServiceProduct, newLineId } from '../utils/format';
import { isCardPaymentMode, isMixedPaymentMode } from '../utils/paymentMode';
import { formatValidationErrors, validateInvoiceForSave } from '../utils/validateInvoice';
import '../styles/pos.css';

interface ReceiptData {
  response: SaveInvoiceResponse;
  invoiceDate: string;
  paymentModeName: string;
  customerName: string;
  mobile: string;
  address: string;
  lines: InvoiceLine[];
  invoiceDiscount: number;
  invoiceDiscountType: InvoiceDiscountType;
  vatAit: number;
  othersCharge: number;
  givenAmount: number;
}

const RECEIPT_EMPTY_LINES: InvoiceLine[] = [];

function ReceiptModal({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: ReceiptData | null;
}) {
  const { totalQty, totalAmt, grandTotal } = useInvoiceTotals(
    data?.lines ?? RECEIPT_EMPTY_LINES,
    data?.invoiceDiscount ?? 0,
    data?.vatAit ?? 0,
    data?.othersCharge ?? 0,
    data?.givenAmount ?? 0,
    data?.invoiceDiscountType ?? 'Amount',
  );

  if (!open || !data) return null;

  const rows = data.lines.filter((l) => l.productName.trim());

  return (
    <div className="mo active" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="md wide">
        <div className="mh">
          <span className="mt">POS Receipt Preview</span>
          <button type="button" className="mc" onClick={onClose}>✕</button>
        </div>
        <div className="mb" id="posReportBody">
          <div className="pos-receipt">
            <div className="r-header">
              <div className="r-logo">{posSession.companyName?.trim() || '—'}</div>
              <div className="r-sub">Point of Sale System</div>
              <div className="r-meta" style={{ marginTop: 10 }}>
                <span><b>Invoice No:</b> {data.response.invoiceNo}</span>
                <span><b>Date:</b> {data.invoiceDate}</span>
                <span><b>Pay Mode:</b> {data.paymentModeName || '—'}</span>
              </div>
            </div>
            <div className="r-section-title">Customer Information</div>
            <div className="r-customer-box">
              <span className="ck">Customer</span><span className="cv">{data.customerName}</span>
              <span className="ck">Mobile</span><span className="cv">{data.mobile}</span>
              <span className="ck">Address</span><span className="cv">{data.address}</span>
            </div>
            <hr className="r-divider" />
            <table className="r-table">
              <thead>
                <tr><th>#</th><th>Product</th><th>Qty</th><th>Price</th><th>Disc</th><th>Total</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id}>
                    <td>{i + 1}</td>
                    <td className="nm">{r.productName}</td>
                    <td>{r.quantity}</td>
                    <td>{formatNumber(r.unitPrice)}</td>
                    <td>{r.discount > 0 ? formatNumber(r.discount) : '—'}</td>
                    <td>{formatNumber(calcLineTotal(r.quantity, r.unitPrice, r.discount, r.vatPercent, r.taxPercent))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="r-totals">
              <div className="r-total-row"><span>Total Quantity</span><span>{totalQty} Pcs</span></div>
              <div className="r-total-row"><span>Sub Total</span><span>{formatCurrency(totalAmt)}</span></div>
              <div className="r-total-row grand"><span>Grand Total</span><span>{formatCurrency(grandTotal)}</span></div>
              <div className="r-total-row"><span>Change</span><span>{formatNumber(data.response.changeAmount)}</span></div>
            </div>
          </div>
        </div>
        <div className="mf">
          <button type="button" className="bp" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export function PosPage() {
  const dispatch = useAppDispatch();
  const form = useAppSelector((s) => s.pos);
  const { showToast } = useToast();

  const { data: health } = useGetHealthQuery();
  const scope = useMemo(
    () => ({ companyId: posSession.companyId, locationId: form.locationId }),
    [form.locationId],
  );
  const { data: paymentModes = [], isLoading: paymentModesLoading, isError: paymentModesError, refetch: refetchPaymentModes } = useGetPaymentModesQuery(scope);
  const { data: salesPersons = [] } = useGetSalesPersonsQuery({ companyId: posSession.companyId });
  const { data: references = [] } = useGetReferencesQuery({ companyId: posSession.companyId });
  const { data: banks = [] } = useGetBanksQuery({ companyId: posSession.companyId });
  const { data: posFeatures } = useGetPosFeaturesQuery({ companyId: posSession.companyId, securityUserId: posSession.securityUserId });
  const { data: biznessEventTypes = [] } = useGetBiznessEventTypesQuery({
    companyId: posSession.companyId,
    locationId: form.locationId,
  });
  const { data: projects = [] } = useGetProjectsQuery({ companyId: posSession.companyId });
  const { data: productTree = [] } = useGetProductTreeQuery(undefined, { skip: !form.sidebarOpen });

  const loginUserWiseSalesPersonSet = posFeatures?.loginUserWiseSalesPersonSet === true;
  const salesPersonEditable = posFeatures?.salesOrderEnableSalesPerson !== false;
  const mixedModeCrossCheck = posFeatures?.mixedModeCrossCheck === true;
  const cashBackOfferEnabled = posFeatures?.cashBackOffer === true;
  const chargeFromBankSetup = posFeatures?.posMachineChargeFromBankSetup === true;
  // BackDateEntrySales ON → Inv. Date editable (past/future). OFF → read-only current date.
  const invoiceDateEditable = posFeatures?.backDateEntrySales === true;
  const salesWithoutPriceSetup = posFeatures?.salesWithoutPriceSetup === true;
  /** Loaded invoices only. Resolved once; do not re-check PosSalesEdit in child components. */
  const isExistingInvoiceLoaded = Boolean(form.salesOrderId);
  const posSalesEditAllowed = posFeatures?.posSalesEdit === true;
  const isInvoiceReadOnly = isExistingInvoiceLoaded && !posSalesEditAllowed;
  const isInvoiceReadOnlyRef = useRef(isInvoiceReadOnly);
  isInvoiceReadOnlyRef.current = isInvoiceReadOnly;

  useEffect(() => {
    if (biznessEventTypes.length === 0) return;
    const current = biznessEventTypes.find((t) => t.biznessEventTypeId === form.biznessEventTypeId);
    if (current) return;
    const regular = biznessEventTypes.find((t) => t.name.trim().toLowerCase() === 'regular');
    dispatch(updateField({
      key: 'biznessEventTypeId',
      value: regular?.biznessEventTypeId ?? biznessEventTypes[0].biznessEventTypeId,
    }));
  }, [biznessEventTypes, dispatch, form.biznessEventTypeId]);

  useEffect(() => {
    if (projects.length === 0) return;
    const current = projects.find((p) => p.projectId === form.projectId);
    if (current) return;
    const general = projects.find((p) => p.name.trim().toLowerCase() === 'general');
    dispatch(updateField({
      key: 'projectId',
      value: general?.projectId ?? projects[0].projectId,
    }));
  }, [projects, dispatch, form.projectId]);

  const [getLedgerDue] = useLazyGetCustomerLedgerDueQuery();
  const [getProduct] = useLazyGetProductQuery();
  const [searchProducts] = useLazySearchProductsQuery();
  const [getPriceHistory] = useLazyGetPriceHistoryQuery();
  const [getProductPrice] = useLazyGetProductPriceQuery();
  const [multiScan] = useLazyMultiScanQuery();
  const [searchMultiScan] = useLazySearchMultiScanQuery();
  const [saveInvoice, { isLoading: saving }] = useSaveInvoiceMutation();
  const [searchInvoices, { data: invoiceOptions = [] }] = useLazySearchInvoicesQuery();
  const [getInvoice] = useLazyGetInvoiceQuery();
  const [createCustomer, { isLoading: creatingCustomer }] = useCreateCustomerMutation();

  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanSessionId] = useState(() => generateId());
  const [scanRelayReady, setScanRelayReady] = useState(false);
  const [remoteScanFrame, setRemoteScanFrame] = useState<string | null>(null);
  const [remoteScanLive, setRemoteScanLive] = useState(false);
  const [focusedProductLineId, setFocusedProductLineId] = useState<string | null>(null);
  const [multiScanPickOpen, setMultiScanPickOpen] = useState(false);
  const [multiScanPickItems, setMultiScanPickItems] = useState<MultiScanSearchItem[]>([]);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerListRefresh, setCustomerListRefresh] = useState(0);
  const [mixedModalOpen, setMixedModalOpen] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [exchangeModalOpen, setExchangeModalOpen] = useState(false);
  const [moreModalOpen, setMoreModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [invoicePosModalOpen, setInvoicePosModalOpen] = useState(false);
  const [challanModalOpen, setChallanModalOpen] = useState(false);
  const [holdModalOpen, setHoldModalOpen] = useState(false);
  const [heldInvoices, setHeldInvoices] = useState<HeldInvoiceRecord[]>([]);
  const [loadingHeld, setLoadingHeld] = useState(false);
  const [listViewModalOpen, setListViewModalOpen] = useState(false);
  const prevPayModeIdRef = useRef(0);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  /** After successful save: lock Save until Clear All. */
  const [saveLocked, setSaveLocked] = useState(false);
  const [serialLineId, setSerialLineId] = useState<string | null>(null);
  const [treePickLineId, setTreePickLineId] = useState<string | null>(null);
  const [hoverLineId, setHoverLineId] = useState<string | null>(null);
  const [hoverProduct, setHoverProduct] = useState<ProductDetail | undefined>();
  const [hoverHistory, setHoverHistory] = useState<{ label: string; value: number }[]>([]);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });
  const [custTip, setCustTip] = useState({ visible: false, x: 0, y: 0 });
  const hoverCache = useRef(new Map<number, { product: ProductDetail; history: { label: string; value: number }[] }>());
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scanRelayRef = useRef<HubConnection | null>(null);
  const remoteScanHandlerRef = useRef<((text: string) => void) | null>(null);
  const scanModalOpenRef = useRef(false);
  const focusedProductLineIdRef = useRef<string | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const lastRemoteScanFrameAtRef = useRef(0);
  const linesRef = useRef(form.lines);
  linesRef.current = form.lines;
  const onClearAllRef = useRef<() => void>(() => {});

  const { data: customerStats } = useGetCustomerStatsQuery(form.buyerId ?? 0, {
    skip: !form.buyerId || !custTip.visible,
  });

  const onDraftRestored = useCallback(() => {
    // Intentionally unused: reload must start a blank POS create (TC-05).
  }, []);

  usePosDraftPersistence(form, dispatch, onDraftRestored);

  const refreshHeldInvoices = useCallback(async () => {
    setLoadingHeld(true);
    try {
      setHeldInvoices(await listHeldInvoices());
    } finally {
      setLoadingHeld(false);
    }
  }, []);

  useEffect(() => {
    if (holdModalOpen) void refreshHeldInvoices();
  }, [holdModalOpen, refreshHeldInvoices]);

  const resetPosUiState = useCallback(() => {
    setReceipt(null);
    setSerialLineId(null);
    setTreePickLineId(null);
    setMixedModalOpen(false);
    setCardModalOpen(false);
    prevPayModeIdRef.current = 0;
  }, []);

  const handleHoldInvoice = useCallback(async (closeModalAfter = false) => {
    if (isInvoiceReadOnlyRef.current) {
      showToast('This invoice is read-only — editing is not allowed', '⚠');
      return;
    }
    const snapshot = toSnapshot(form);
    if (!hasSnapshotContent(snapshot)) {
      showToast('Nothing to hold — enter invoice details first', '⚠');
      return;
    }

    const choice = await confirmHoldInvoice();
    if (choice === 'cancel') return;

    await addHeldInvoice(snapshot);
    await refreshHeldInvoices();

    if (choice === 'clear') {
      dispatch(resetPosForm());
      resetPosUiState();
      await clearPosDraft();
    }

    showToast('Invoice held offline ✓', '⏸️');
    if (closeModalAfter) setHoldModalOpen(false);
  }, [dispatch, form, refreshHeldInvoices, resetPosUiState, showToast]);

  const handleRestoreHeld = useCallback(async (id: string) => {
    const record = await getHeldInvoice(id);
    if (!record) {
      showToast('Held invoice not found', '⚠');
      return;
    }
    dispatch(restoreSnapshot(record.snapshot));
    await removeHeldInvoice(id);
    await refreshHeldInvoices();
    setHoldModalOpen(false);
    showToast('Held invoice restored', '📄');
  }, [dispatch, refreshHeldInvoices, showToast]);

  const handleDeleteHeld = useCallback(async (id: string) => {
    await removeHeldInvoice(id);
    await refreshHeldInvoices();
    showToast('Held invoice removed', '🗑️');
  }, [refreshHeldInvoices, showToast]);

  const parentPaymentModes = useMemo(
    () => paymentModes.filter((m) => !isSubPaymentMode(m)),
    [paymentModes],
  );

  const subPaymentModes = useMemo(() => {
    const subs = paymentModes.filter(isSubPaymentMode);
    if (form.paymentModeId > 0) {
      return subs.filter((m) => m.parentId === form.paymentModeId);
    }
    return subs;
  }, [paymentModes, form.paymentModeId]);

  const onPaymentModeChange = useCallback((paymentModeId: number) => {
    if (isInvoiceReadOnlyRef.current) return;
    dispatch(updateField({ key: 'paymentModeId', value: paymentModeId }));
    const currentSub = paymentModes.find((m) => m.paymentModeId === form.subPaymentModeId);
    if (paymentModeId <= 0 || currentSub?.parentId !== paymentModeId) {
      dispatch(updateField({ key: 'subPaymentModeId', value: undefined }));
    }
  }, [dispatch, form.subPaymentModeId, paymentModes]);

  useEffect(() => {
    if (parentPaymentModes.length === 0) return;
    const current = parentPaymentModes.find((m) => m.paymentModeId === form.paymentModeId);
    if (current) return;
    const cashMode = parentPaymentModes.find((m) => m.name.trim().toLowerCase() === 'cash');
    dispatch(updateField({
      key: 'paymentModeId',
      value: cashMode?.paymentModeId ?? parentPaymentModes[0].paymentModeId,
    }));
  }, [dispatch, parentPaymentModes, form.paymentModeId]);

  const onSubPaymentModeChange = useCallback((subPaymentModeId: number) => {
    if (!subPaymentModeId) {
      dispatch(updateField({ key: 'subPaymentModeId', value: undefined }));
      return;
    }
    const sub = paymentModes.find((m) => m.paymentModeId === subPaymentModeId);
    if (!sub?.parentId) return;
    dispatch(updateField({ key: 'paymentModeId', value: sub.parentId }));
    dispatch(updateField({ key: 'subPaymentModeId', value: sub.paymentModeId }));
  }, [dispatch, paymentModes]);

  const selectedPayMode = useMemo(
    () => parentPaymentModes.find((m) => m.paymentModeId === form.paymentModeId) ?? null,
    [parentPaymentModes, form.paymentModeId],
  );
  const selectedSubPayMode = useMemo(
    () => paymentModes.find((m) => m.paymentModeId === form.subPaymentModeId) ?? null,
    [paymentModes, form.subPaymentModeId],
  );
  const onPayModeSelect = useCallback((mode: PaymentMode) => {
    if (isMixedPaymentMode(mode)) {
      prevPayModeIdRef.current = form.paymentModeId;
      onPaymentModeChange(mode.paymentModeId);
      setCardModalOpen(false);
      setMixedModalOpen(true);
      return;
    }
    if (isCardPaymentMode(mode)) {
      prevPayModeIdRef.current = form.paymentModeId;
      dispatch(updateField({ key: 'mixedPayment', value: undefined }));
      onPaymentModeChange(mode.paymentModeId);
      setMixedModalOpen(false);
      setCardModalOpen(true);
      return;
    }
    dispatch(updateField({ key: 'mixedPayment', value: undefined }));
    dispatch(updateField({ key: 'cardPayment', value: undefined }));
    onPaymentModeChange(mode.paymentModeId);
  }, [dispatch, form.paymentModeId, onPaymentModeChange]);

  const closeMixedMode = useCallback(() => {
    setMixedModalOpen(false);
    const cashMode = parentPaymentModes.find((m) => m.name.trim().toLowerCase() === 'cash');
    const revertId = cashMode?.paymentModeId ?? prevPayModeIdRef.current ?? 0;
    onPaymentModeChange(revertId);
    dispatch(updateField({ key: 'mixedPayment', value: undefined }));
    dispatch(updateField({ key: 'givenAmount', value: 0 }));
  }, [dispatch, onPaymentModeChange, parentPaymentModes]);

  const confirmMixedMode = useCallback((payment: MixedModePayment) => {
    const cardTotal = payment.cards.reduce((sum, c) => sum + (c.amount || 0), 0);
    const totalPaid = payment.cashAmount + payment.chequeAmount + cardTotal;
    dispatch(updateField({ key: 'mixedPayment', value: payment }));
    dispatch(updateField({ key: 'cardPayment', value: undefined }));
    dispatch(updateField({ key: 'givenAmount', value: totalPaid }));
    setMixedModalOpen(false);
    showToast('Mixed payment confirmed ✓', '💳');
  }, [dispatch, showToast]);

  const closeCardMode = useCallback(() => {
    setCardModalOpen(false);
    const cashMode = parentPaymentModes.find((m) => m.name.trim().toLowerCase() === 'cash');
    const revertId = cashMode?.paymentModeId ?? prevPayModeIdRef.current ?? 0;
    onPaymentModeChange(revertId);
    dispatch(updateField({ key: 'cardPayment', value: undefined }));
  }, [dispatch, onPaymentModeChange, parentPaymentModes]);

  const confirmCardMode = useCallback((payment: CardPayment) => {
    dispatch(updateField({ key: 'cardPayment', value: payment }));
    dispatch(updateField({ key: 'mixedPayment', value: undefined }));
    setCardModalOpen(false);
    showToast('Card payment confirmed ✓', '💳');
  }, [dispatch, showToast]);
  const onPayModeClear = useCallback(() => {
    onPaymentModeChange(0);
  }, [onPaymentModeChange]);
  const onSubPayModeSelect = useCallback((mode: PaymentMode) => {
    onSubPaymentModeChange(mode.paymentModeId);
    const parent = paymentModes.find((m) => m.paymentModeId === mode.parentId);
    if (parent && isCardPaymentMode(parent)) {
      setCardModalOpen(true);
    }
  }, [onSubPaymentModeChange, paymentModes]);
  const onSubPayModeClear = useCallback(() => {
    onSubPaymentModeChange(0);
  }, [onSubPaymentModeChange]);

  const { totalQty, totalAmt, grandTotal, changeAmount, discountAmount } = useInvoiceTotals(
    form.lines,
    form.invoiceDiscount,
    form.vatAit,
    form.othersCharge,
    form.givenAmount,
    form.invoiceDiscountType,
  );

  useEffect(() => {
    if (form.invoiceDiscountType !== 'Amount') return;
    if (form.invoiceDiscount > 0 && form.invoiceDiscount > totalAmt) {
      dispatch(updateField({ key: 'invoiceDiscount', value: Math.max(0, totalAmt) }));
      showToast('Inv. discount cannot be greater than Total bill', '⚠');
    }
  }, [dispatch, form.invoiceDiscount, form.invoiceDiscountType, showToast, totalAmt]);

  const applyProductToLine = useCallback(
    async (lineId: string, product: ProductDetail) => {
      const isDuplicate = linesRef.current.some(
        (l) => l.rowStatus !== 'deleted' && l.id !== lineId && l.productId === product.productId,
      );
      if (isDuplicate) {
        showToast(`${product.name} is already added to this invoice`, '⚠');
        dispatch(updateLine({
          id: lineId,
          patch: {
            productName: '', productId: undefined, modelNo: '', stock: '—', stockQty: 0,
            productType: undefined,
            unit: '', quantity: 0, unitPrice: 0, discount: 0, warrantyDays: 0,
            vatPercent: 0, taxPercent: 0, isSerial: false, serials: [],
            hasPriceSetup: undefined,
          },
        }));
        return;
      }
      dispatch(
        updateLine({
          id: lineId,
          patch: {
            productId: product.productId,
            productName: product.name,
            modelNo: product.modelNo ?? '',
            stock: formatStockDisplay(product.stockQty, product.unitName, product.productType),
            stockQty: isServiceProduct(product.productType) ? 0 : product.stockQty,
            productType: product.productType,
            unit: product.unitName ?? 'Pcs',
            unitPrice: product.lastPrice,
            warrantyDays: product.warrantyDays,
            isSerial: product.isSerial,
            quantity: 0,
            serials: [],
            hasPriceSetup: product.hasPriceSetup === true,
          },
        }),
      );
      if (!salesWithoutPriceSetup && product.hasPriceSetup !== true) {
        const rows = linesRef.current.filter((l) => l.rowStatus !== 'deleted');
        const idx = rows.findIndex((l) => l.id === lineId);
        const rowNo = idx >= 0 ? idx + 1 : rows.filter(isLineFilled).length + 1;
        showToast(
          `Row ${rowNo} has a product "${product.name}" which do not have price setup configuration`,
          '⚠',
        );
      }
      if (product.isSerial) {
        setSerialLineId(lineId);
        showToast('Serial product detected — Enter serials', '🔢');
      }
    },
    [dispatch, salesWithoutPriceSetup, showToast],
  );

  const selectCustomer = useCallback(async (customer: CustomerSearchResult) => {
    if (isInvoiceReadOnlyRef.current) return;
    dispatch(setCustomer(customer));
    // LoginUserWiseSalesPersonSet = true → keep current/login sales person (do not overwrite from buyer).
    // LoginUserWiseSalesPersonSet = false/missing → set sales person from the selected buyer.
    if (!loginUserWiseSalesPersonSet && customer.employeeId && customer.employeeId > 0) {
      dispatch(updateField({ key: 'employeeId', value: customer.employeeId }));
    }
    try {
      const due = await getLedgerDue({
        buyerId: customer.buyerId,
        userId: posSession.securityUserId,
      }).unwrap();
      dispatch(updateField({ key: 'ledgerDue', value: due }));
    } catch {
      /* ledger optional */
    }
  }, [dispatch, getLedgerDue, loginUserWiseSalesPersonSet]);

  const onProductSelect = useCallback(async (lineId: string, product: ProductSearchResult) => {
    if (isInvoiceReadOnlyRef.current) return;
    try {
      const detail = await getProduct({
        productId: product.productId,
        locationId: form.locationId,
        companyId: posSession.companyId,
      }).unwrap();
      await applyProductToLine(lineId, detail);
      dispatch(ensureTrailingEmptyRow());
    } catch {
      showToast('Failed to load product', '⚠');
    }
  }, [applyProductToLine, dispatch, form.locationId, getProduct, showToast]);

  const resolveTreeTargetLineId = useCallback(() => {
    const visible = form.lines.filter((l) => l.rowStatus !== 'deleted');

    let lastIdx = -1;
    for (let i = 0; i < visible.length; i++) {
      if (visible[i].productId) lastIdx = i;
    }
    const targetIdx = lastIdx + 1;

    if (targetIdx < visible.length && !visible[targetIdx].productId) {
      return { lineId: visible[targetIdx].id, insert: false as const };
    }

    const lineId = newLineId();
    return { lineId, insert: true as const, index: targetIdx };
  }, [form.lines]);

  const handleTreeProductSelect = useCallback(async (_model: string, productId?: number) => {
    if (isInvoiceReadOnlyRef.current) return;
    if (!productId) return;
    try {
      const product = await getProduct({
        productId,
        locationId: form.locationId,
        companyId: posSession.companyId,
      }).unwrap();

      if (treePickLineId) {
        await applyProductToLine(treePickLineId, product);
        setTreePickLineId(null);
        dispatch(ensureTrailingEmptyRow());
        showToast(`Selected: ${product.name}`);
        return;
      }

      const target = resolveTreeTargetLineId();
      if (target.insert) {
        dispatch(insertLineAtIndex({ index: target.index, id: target.lineId }));
      }

      await applyProductToLine(target.lineId, product);
      dispatch(ensureTrailingEmptyRow());
      showToast(`Selected: ${product.name}`);
    } catch {
      showToast('Failed to load product', '⚠');
    }
  }, [applyProductToLine, dispatch, form.locationId, getProduct, resolveTreeTargetLineId, showToast, treePickLineId]);

  const onSelectProductFromTree = useCallback((lineId: string) => {
    if (isInvoiceReadOnlyRef.current) return;
    setTreePickLineId(lineId);
    if (!form.sidebarOpen) dispatch(toggleSidebar());
    showToast('Pick a product from the tree', '🌳');
  }, [dispatch, form.sidebarOpen, showToast]);

  const onProductNameCommit = useCallback((lineId: string, name: string) => {
    if (isInvoiceReadOnlyRef.current) return;
    if (!name.trim()) {
      dispatch(updateLine({
        id: lineId,
        patch: {
          productName: '',
          productId: undefined,
          modelNo: '',
          stock: '—',
          stockQty: 0,
          productType: undefined,
          unit: '',
          quantity: 0,
          unitPrice: 0,
          discount: 0,
          warrantyDays: 0,
          vatPercent: 0,
          taxPercent: 0,
          isSerial: false,
          serials: [],
        },
      }));
      return;
    }
    dispatch(updateLine({ id: lineId, patch: { productName: name } }));
  }, [dispatch]);

  /** Remote scan only — prefers data-product-line-id after trailing row is ready. */
  const focusNextProductLine = useCallback((currentLineId: string) => {
    dispatch(ensureTrailingEmptyRow());
    const tryFocus = () => {
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('[data-product-line-id]'));
      const idx = inputs.findIndex((el) => el.dataset.productLineId === currentLineId);
      const next = inputs[idx + 1];
      if (next) {
        next.focus();
        return true;
      }
      return false;
    };
    window.requestAnimationFrame(() => {
      if (tryFocus()) return;
      window.requestAnimationFrame(() => { tryFocus(); });
    });
  }, [dispatch]);

  const focusSaveButton = useCallback(() => {
    saveButtonRef.current?.focus();
  }, []);

  const applyProductLineRemoteScan = useCallback(async (term: string, lineId: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;

    try {
      const results = await searchProducts({
        q: trimmed,
        locationId: form.locationId > 0 ? form.locationId : undefined,
        companyId: posSession.companyId > 0 ? posSession.companyId : undefined,
        limit: 5000,
      }).unwrap();

      if (results.length === 0) {
        showToast(`No product match for "${trimmed}"`, '⚠');
        return;
      }
      if (results.length > 1) {
        showToast(`Multiple products match "${trimmed}" — pick manually`, '⚠');
        return;
      }

      await onProductSelect(lineId, results[0]);
      focusNextProductLine(lineId);
      showToast(`Product: ${results[0].name}`);
    } catch {
      showToast('Product search failed', '⚠');
    }
  }, [focusNextProductLine, form.locationId, onProductSelect, searchProducts, showToast]);

  const applyProductLineRemoteScanRef = useRef(applyProductLineRemoteScan);
  applyProductLineRemoteScanRef.current = applyProductLineRemoteScan;

  const registerRemoteScanHandler = useCallback((handler: ((text: string) => void) | null) => {
    remoteScanHandlerRef.current = handler;
  }, []);

  useEffect(() => {
    scanModalOpenRef.current = scanModalOpen;
    focusedProductLineIdRef.current = focusedProductLineId;

    const relay = scanRelayRef.current;
    if (relay?.state === HubConnectionState.Connected) {
      void setRemoteArmState(relay, scanSessionId, scanModalOpen).catch(() => {});
    }

    if (!scanModalOpen) {
      setRemoteScanLive(false);
      setRemoteScanFrame(null);
      lastRemoteScanFrameAtRef.current = 0;
    }
  }, [focusedProductLineId, scanModalOpen, scanSessionId]);

  useEffect(() => {
    if (!scanModalOpen) return;

    const timer = window.setInterval(() => {
      if (!lastRemoteScanFrameAtRef.current) return;
      if (Date.now() - lastRemoteScanFrameAtRef.current > REMOTE_FEED_TIMEOUT_MS) {
        setRemoteScanLive(false);
        setRemoteScanFrame(null);
        lastRemoteScanFrameAtRef.current = 0;
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [scanModalOpen]);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const relay = await connectPosRelay(scanSessionId, {
          onScan: (text) => {
            if (remoteScanHandlerRef.current) {
              remoteScanHandlerRef.current(text);
              return;
            }
            const lineId = focusedProductLineIdRef.current;
            if (lineId) void applyProductLineRemoteScanRef.current(text, lineId);
          },
          onPreviewFrame: (frame) => {
            if (!scanModalOpenRef.current) return;
            lastRemoteScanFrameAtRef.current = Date.now();
            setRemoteScanFrame(frame);
            setRemoteScanLive(true);
          },
          onRemoteLeft: () => {
            setRemoteScanLive(false);
            setRemoteScanFrame(null);
            lastRemoteScanFrameAtRef.current = 0;
          },
          onRemoteJoined: () => {
            const relay = scanRelayRef.current;
            if (relay?.state === HubConnectionState.Connected) {
              void setRemoteArmState(relay, scanSessionId, scanModalOpenRef.current).catch(() => {});
            }
          },
        });

        if (cancelled) {
          await relay.stop();
          return;
        }

        scanRelayRef.current = relay;
        setScanRelayReady(true);
      } catch {
        if (!cancelled) setScanRelayReady(false);
      }
    };

    void start();

    return () => {
      cancelled = true;
      void scanRelayRef.current?.stop();
      scanRelayRef.current = null;
    };
  }, [scanSessionId]);

  const onProductFocus = useCallback((lineId: string) => {
    setFocusedProductLineId(lineId);
  }, []);

  const onProductBlur = useCallback((lineId: string) => {
    setFocusedProductLineId((current) => (current === lineId ? null : current));
  }, []);

  const applyPosSalesPrice = useCallback(async (lineId: string, productId: number, quantity: number) => {
    if (!productId || salesWithoutPriceSetup) return;
    try {
      const quote = await getProductPrice({
        productId,
        quantity,
        companyId: posSession.companyId,
        locationId: form.locationId,
      }).unwrap();
      if (quote == null || quote.price === null || quote.price === undefined) {
        dispatch(updateLine({
          id: lineId,
          patch: { unitPrice: 0, unitPriceMin: undefined, unitPriceMax: undefined },
        }));
        return;
      }
      const unitPrice = Number(quote.price);
      const min = quote.minPrice == null ? undefined : Number(quote.minPrice);
      const max = quote.maxPrice == null ? undefined : Number(quote.maxPrice);
      dispatch(updateLine({
        id: lineId,
        patch: {
          unitPrice,
          unitPriceMin: Number.isFinite(min as number) ? min : undefined,
          unitPriceMax: Number.isFinite(max as number) ? max : undefined,
        },
      }));
    } catch {
      dispatch(updateLine({
        id: lineId,
        patch: { unitPrice: 0, unitPriceMin: undefined, unitPriceMax: undefined },
      }));
    }
  }, [dispatch, form.locationId, getProductPrice, salesWithoutPriceSetup]);

  const onQuantityBlur = useCallback((lineId: string) => {
    const line = form.lines.find((l) => l.id === lineId);
    if (!line?.productId || line.isSerial) return;
    void applyPosSalesPrice(lineId, line.productId, line.quantity);
  }, [applyPosSalesPrice, form.lines]);

  const computeTipPos = useCallback((rect: DOMRect) => {
    const TIP_W = 280;
    const TIP_H = 190;
    let x = rect.left + 40;
    if (x + TIP_W > window.innerWidth - 10) x = window.innerWidth - TIP_W - 12;
    if (x < 10) x = 10;
    let y = rect.top - TIP_H - 8;
    if (y < 10) y = rect.bottom + 8;
    return { x, y };
  }, []);

  const handleRowHover = useCallback(async (lineId: string | null, rect?: DOMRect) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHoverLineId(lineId);
    if (!lineId || !rect) {
      setHoverProduct(undefined);
      return;
    }
    hoverTimer.current = setTimeout(async () => {
      const line = form.lines.find((l) => l.id === lineId);
      if (!line?.productId) return;
      const cached = hoverCache.current.get(line.productId);
      if (cached) {
        setHoverProduct(cached.product);
        setHoverHistory(cached.history);
        setTipPos(computeTipPos(rect));
        return;
      }
      try {
        const product = await getProduct({
          productId: line.productId,
          locationId: form.locationId,
          companyId: posSession.companyId,
        }).unwrap();
        let history: { label: string; value: number }[] = [];
        try {
          history = await getPriceHistory({ productId: line.productId, buyerId: form.buyerId }).unwrap();
        } catch {
          /* price history is optional — still show product/cost info */
        }
        hoverCache.current.set(line.productId!, { product, history });
        setHoverProduct(product);
        setHoverHistory(history);
        setTipPos(computeTipPos(rect));
      } catch {
        setHoverProduct(undefined);
      }
    }, 200);
  }, [form.lines, form.buyerId, form.locationId, getProduct, getPriceHistory, computeTipPos]);

  const handleSave = useCallback(async () => {
    if (isInvoiceReadOnlyRef.current) {
      showToast('This invoice is read-only — editing is not allowed', '⚠');
      return;
    }
    if (saveLocked || saving) return;

    const payMode = form.paymentModeId
      ? paymentModes.find((p) => p.paymentModeId === form.paymentModeId)
      : undefined;

    const validationErrors = validateInvoiceForSave({
      buyerId: form.buyerId,
      customerName: form.customerName,
      employeeId: form.employeeId,
      paymentModeId: form.paymentModeId,
      biznessEventTypeId: form.biznessEventTypeId,
      projectId: form.projectId,
      givenAmount: form.givenAmount,
      grandTotal,
      lines: form.lines,
      paymentModes,
      subPaymentModeId: form.subPaymentModeId,
      mixedPaymentConfirmed: form.mixedPayment?.confirmed,
      cardPaymentConfirmed: form.cardPayment?.confirmed,
      mixedModeCrossCheck,
    });

    if (validationErrors.length) {
      if (validationErrors.some((error) =>
        error.includes('mixed payment')
        || error.includes('Grand Total'))) {
        setMixedModalOpen(true);
      }
      if (validationErrors.some((error) => error.includes('card payment'))) {
        setCardModalOpen(true);
      }
      showToast(formatValidationErrors(validationErrors), '⚠');
      return;
    }

    if (discountAmount > totalAmt) {
      showToast('Inv. discount cannot be greater than Total bill', '⚠');
      return;
    }

    const activeLines = form.lines.filter((l) => l.rowStatus !== 'deleted' && isLineFilled(l));

    if (!salesWithoutPriceSetup) {
      const missingPriceSetup = activeLines
        .map((line, index) => ({ line, rowNo: index + 1 }))
        .filter(({ line }) => line.hasPriceSetup === false);
      if (missingPriceSetup.length > 0) {
        showToast(
          missingPriceSetup
            .map(({ line, rowNo }) =>
              `Row ${rowNo} has a product "${line.productName}" which do not have price setup configuration`)
            .join('\n'),
          '⚠',
        );
        return;
      }
    }

    for (const [index, line] of activeLines.entries()) {
      if (
        line.unitPriceMin != null
        && line.unitPrice < line.unitPriceMin
      ) {
        showToast(
          `Row ${index + 1}: unit price for "${line.productName}" cannot be lower than ${formatNumber(line.unitPriceMin)}`,
          '⚠',
        );
        return;
      }
      if (
        line.unitPriceMax != null
        && line.unitPrice > line.unitPriceMax
      ) {
        showToast(
          `Row ${index + 1}: unit price for "${line.productName}" cannot be higher than ${formatNumber(line.unitPriceMax)}`,
          '⚠',
        );
        return;
      }
    }

    for (const line of activeLines) {
      if (!isServiceProduct(line.productType) && line.stockQty > 0 && line.quantity > line.stockQty) {
        showToast(`Quantity exceeds stock for ${line.productName} (max ${line.stockQty})`, '⚠');
        return;
      }
      if (line.isSerial && line.serials.length !== line.quantity) {
        showToast(`Serial count mismatch for ${line.productName}`, '⚠');
        return;
      }
      if (line.isSerial && line.serials.length === 0) {
        showToast(`Add serials for ${line.productName}`, '⚠');
        return;
      }
    }

    const lines = activeLines.map((l) => ({
      salesOrderDetailId: l.salesOrderDetailId,
      productId: l.productId!,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: l.discount,
      warrantyDays: l.warrantyDays,
      vatPercent: l.vatPercent,
      taxPercent: l.taxPercent,
      serials: l.serials.map((s) => ({ serialNo: s.serialNo, discount: s.discount })),
    }));

    try {
      const response = await saveInvoice({
        salesOrderId: form.salesOrderId,
        buyerId: form.buyerId,
        customerName: form.customerName,
        mobile: form.mobile,
        address: form.address,
        remarks: form.remarks,
        locationId: form.locationId,
        paymentModeId: form.paymentModeId,
        subPaymentModeId: form.subPaymentModeId,
        referenceId: form.referenceId,
        biznessEventTypeId: form.biznessEventTypeId,
        projectId: form.projectId,
        employeeId: form.employeeId,
        entryBy: posSession.securityUserId,
        entryByUserName: posSession.securityUserName,
        invoiceDate: form.invoiceDate,
        paymentPromiseDate: form.paymentPromiseDate || form.invoiceDate,
        previousDues: form.ledgerDue ?? 0,
        invoiceDiscount: form.invoiceDiscount,
        invoiceDiscountType: form.invoiceDiscountType,
        vatAit: form.vatAit,
        othersCharge: form.othersCharge,
        givenAmount: form.givenAmount,
        payModeName: payMode?.name,
        mixedPayment: form.mixedPayment?.confirmed
          ? {
              cashAmount: form.mixedPayment.cashAmount,
              chequeAmount: form.mixedPayment.chequeAmount,
              chequeNo: form.mixedPayment.chequeNo,
              chequeBank: form.mixedPayment.chequeBank,
              chequeBankId: form.mixedPayment.chequeBankId,
              chequeDate: form.mixedPayment.chequeDate,
              multiCard: form.mixedPayment.multiCard,
              cards: form.mixedPayment.cards.map((c) => {
                const isEmi = c.emiMode === 'emi';
                const chargeNumeric = String(c.charge ?? '').replace(/%/g, '').trim();
                return {
                  amount: c.amount,
                  cardNo: c.cardNo,
                  bank: c.bank,
                  bankId: c.bankId,
                  expiryDate: c.expiryDate,
                  posMachine: c.posMachine,
                  charge: chargeNumeric,
                  posMachineBankId: c.posMachineBankId,
                  cashBackAmount: c.cashBackOffer,
                  isEmi,
                  emiBankId: isEmi ? c.emiBankId : undefined,
                  emiId: isEmi ? c.emiDurationId : undefined,
                  emiDeductionPercentage: isEmi ? c.emiDeductionRate : undefined,
                };
              }),
              confirmed: true,
            }
          : undefined,
        cardPayment: form.cardPayment?.confirmed
          ? {
              cardNo: form.cardPayment.cardNo,
              bank: form.cardPayment.bank || selectedSubPayMode?.name || '',
              bankId: form.cardPayment.bankId,
              expiryDate: form.cardPayment.expiryDate,
              posMachine: form.cardPayment.posMachine,
              charge: form.cardPayment.charge,
              confirmed: true,
            }
          : undefined,
        lines,
        deletedLineIds: form.deletedLineIds.length ? form.deletedLineIds : undefined,
      }).unwrap();

      // Snapshot the just-saved invoice for the receipt preview before clearing.
      const receiptSnapshot: ReceiptData = {
        response,
        invoiceDate: form.invoiceDate,
        paymentModeName:
          selectedSubPayMode?.name?.trim()
          || selectedPayMode?.name?.trim()
          || '',
        customerName: form.customerName,
        mobile: form.mobile,
        address: form.address,
        lines: form.lines.map((l) => ({ ...l, serials: l.serials.map((s) => ({ ...s })) })),
        invoiceDiscount: form.invoiceDiscount,
        invoiceDiscountType: form.invoiceDiscountType,
        vatAit: form.vatAit,
        othersCharge: form.othersCharge,
        givenAmount: form.givenAmount,
      };
      showToast(response.message || 'Invoice saved successfully', '💾');

      // Keep the saved invoice on screen (reload from server) and lock Save until Clear All.
      try {
        const loaded = await getInvoice({
          invoiceNo: response.invoiceNo,
          companyId: posSession.companyId,
          locationId: form.locationId,
        }).unwrap();
        dispatch(loadInvoice(loaded));
        if (loaded.buyerId) {
          try {
            const due = await getLedgerDue({
              buyerId: loaded.buyerId,
              userId: posSession.securityUserId,
            }).unwrap();
            dispatch(updateField({ key: 'ledgerDue', value: due }));
          } catch {
            /* ledger optional */
          }
        }
      } catch {
        // Fallback: still leave identity from the save response on the form.
        dispatch(updateField({ key: 'invoiceNo', value: response.invoiceNo }));
        dispatch(updateField({ key: 'salesOrderId', value: response.salesOrderId }));
        if (response.salesOrderNo) {
          dispatch(updateField({ key: 'salesOrderNo', value: response.salesOrderNo }));
        }
      }

      setSaveLocked(true);
      setReceipt(receiptSnapshot);
    } catch {
      /* API error toast handled by apiErrorMiddleware */
    }
  }, [
    dispatch,
    form,
    grandTotal,
    totalAmt,
    discountAmount,
    paymentModes,
    saveInvoice,
    selectedPayMode,
    selectedSubPayMode,
    showToast,
    mixedModeCrossCheck,
    salesWithoutPriceSetup,
    saveLocked,
    saving,
    getInvoice,
    getLedgerDue,
  ]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (isInvoiceReadOnlyRef.current || saveLocked || saving) return;
        void handleSave();
      }
      if (e.key === 'F9') {
        e.preventDefault();
        if (isInvoiceReadOnlyRef.current) return;
        setHoldModalOpen(true);
      }
      if (e.key === 'Escape') {
        setHoldModalOpen(false);
        setListViewModalOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, saveLocked, saving]);

  const onLineChange = useCallback((id: string, patch: Partial<InvoiceLine>) => {
    if (isInvoiceReadOnlyRef.current) return;
    const line = form.lines.find((l) => l.id === id);
    if (
      line
      && !isServiceProduct(line.productType)
      && patch.quantity !== undefined
      && line.stockQty > 0
      && patch.quantity > line.stockQty
    ) {
      showToast(`Quantity cannot exceed stock (${line.stockQty})`, '⚠');
      patch = { ...patch, quantity: line.stockQty };
    }
    if (line && patch.unitPrice !== undefined) {
      let up = Number(patch.unitPrice);
      if (!Number.isFinite(up) || up < 0) up = 0;
      // Range limits (unitPriceMin/Max) are enforced on blur so the user can type freely.
      patch = { ...patch, unitPrice: up };
      if (line.discount > up) {
        patch = { ...patch, discount: up };
      }
    }
    dispatch(updateLine({ id, patch }));
  }, [dispatch, form.lines, showToast]);

  const onUnitPriceBlur = useCallback((lineId: string) => {
    const line = form.lines.find((l) => l.id === lineId);
    if (!line?.productId) return;
    let up = Number(line.unitPrice);
    if (!Number.isFinite(up) || up < 0) up = 0;
    const min = line.unitPriceMin;
    const max = line.unitPriceMax;
    if (min != null && up < min) {
      showToast(
        `You cannot set the price less than ${formatNumber(min)} for ${line.productName || 'this product'}`,
        '⚠',
      );
      up = min;
    } else if (max != null && up > max) {
      showToast(
        `You cannot set the price more than ${formatNumber(max)} for ${line.productName || 'this product'}`,
        '⚠',
      );
      up = max;
    }
    const patch: Partial<InvoiceLine> = { unitPrice: up };
    if (line.discount > up) patch.discount = up;
    if (up !== line.unitPrice || patch.discount !== undefined) {
      dispatch(updateLine({ id: lineId, patch }));
    }
  }, [dispatch, form.lines, showToast]);
  const onMarkDeleted = useCallback((id: string) => {
    if (isInvoiceReadOnlyRef.current) return;
    dispatch(markLineDeleted(id));
  }, [dispatch]);
  const onEnsureTrailingRow = useCallback(() => {
    if (isInvoiceReadOnlyRef.current) return;
    dispatch(ensureTrailingEmptyRow());
  }, [dispatch]);
  const onClearAll = useCallback(() => {
    dispatch(resetPosForm());
    // Clear All keeps the default payment mode (Cash) rather than emptying it.
    const cashMode = parentPaymentModes.find((m) => m.name.trim().toLowerCase() === 'cash');
    if (cashMode) {
      dispatch(updateField({ key: 'paymentModeId', value: cashMode.paymentModeId }));
    }
    resetPosUiState();
    setSaveLocked(false);
    void clearPosDraft();
  }, [dispatch, parentPaymentModes, resetPosUiState]);
  onClearAllRef.current = onClearAll;
  const onCustomerNameCommit = useCallback((name: string) => {
    if (isInvoiceReadOnlyRef.current) return;
    dispatch(updateField({ key: 'customerName', value: name }));
    // Free-typed values never create / keep a buyer master record (TC-07).
    dispatch(updateField({ key: 'buyerId', value: undefined }));
    dispatch(updateField({ key: 'ledgerDue', value: 0 }));
    if (!name.trim()) {
      dispatch(updateField({ key: 'mobile', value: '' }));
      dispatch(updateField({ key: 'address', value: '' }));
    }
  }, [dispatch]);
  const onMobileCommit = useCallback((mobile: string) => {
    if (isInvoiceReadOnlyRef.current) return;
    dispatch(updateField({ key: 'mobile', value: mobile }));
    dispatch(updateField({ key: 'buyerId', value: undefined }));
    dispatch(updateField({ key: 'ledgerDue', value: 0 }));
    if (!mobile.trim()) {
      dispatch(updateField({ key: 'customerName', value: '' }));
      dispatch(updateField({ key: 'address', value: '' }));
    }
  }, [dispatch]);
  const selectedSalesPerson = useMemo(() => salesPersons.find((sp) => sp.employeeId === form.employeeId) ?? null, [salesPersons, form.employeeId]);
  const selectedReference = useMemo(
    () => references.find((ref) => ref.allCompanyId === form.referenceId) ?? null,
    [references, form.referenceId],
  );
  const onReferenceSelect = useCallback((reference: ReferenceOption) => {
    if (isInvoiceReadOnlyRef.current) return;
    dispatch(updateField({ key: 'referenceId', value: reference.allCompanyId }));
  }, [dispatch]);
  const onReferenceClear = useCallback(() => {
    if (isInvoiceReadOnlyRef.current) return;
    dispatch(updateField({ key: 'referenceId', value: undefined }));
  }, [dispatch]);

  const selectedInvoice = useMemo<InvoiceSearchResult | null>(() => {
    if (!form.invoiceNo) return null;
    return {
      invoiceNo: form.invoiceNo,
      salesOrderId: form.salesOrderId ?? '',
      customerName: form.customerName,
    };
  }, [form.customerName, form.invoiceNo, form.salesOrderId]);

  const onInvoiceSearch = useCallback((term: string) => {
    void searchInvoices({
      q: term.trim() || undefined,
      companyId: posSession.companyId,
      locationId: form.locationId,
      limit: 50,
    });
  }, [form.locationId, searchInvoices]);

  const loadInvoiceByNo = useCallback(async (invoiceNo: string) => {
    const loaded = await getInvoice({
      invoiceNo: invoiceNo.trim(),
      companyId: posSession.companyId,
      locationId: form.locationId,
    }).unwrap();
    dispatch(loadInvoice(loaded));
    if (loaded.buyerId) {
      try {
        const due = await getLedgerDue({
          buyerId: loaded.buyerId,
          userId: posSession.securityUserId,
        }).unwrap();
        dispatch(updateField({ key: 'ledgerDue', value: due }));
      } catch {
        /* ledger optional */
      }
    }
    showToast(`Loaded ${loaded.invoiceNo}`, '📄');
  }, [dispatch, form.locationId, getInvoice, getLedgerDue, showToast]);

  const applySerialScan = useCallback(async (serial: MultiScanSerialItem) => {
    if (isInvoiceReadOnlyRef.current) return;
    const visible = form.lines.filter((l) => l.rowStatus !== 'deleted');
    const lineIdx = visible.findIndex((l) => l.productId === serial.productId);

    if (lineIdx >= 0) {
      const line = visible[lineIdx];
      if (line.serials.some((s) => s.serialNo.toLowerCase() === serial.serialNo.toLowerCase())) {
        showToast(
          `Serial has already been added for ${line.productName} — see row #${lineIdx + 1} in invoice items`,
          '⚠',
        );
        return;
      }
      const serials = [...line.serials, { serialNo: serial.serialNo, discount: serial.discountAmount, dbDiscount: serial.discountAmount }];
      const unitDisc = serials.length > 0
        ? serials.reduce((s, x) => s + (x.discount || 0), 0) / serials.length
        : 0;
      dispatch(updateLine({
        id: line.id,
        patch: {
          serials,
          quantity: serials.length,
          discount: unitDisc,
        },
      }));
      if (line.productId) {
        void applyPosSalesPrice(line.id, line.productId, serials.length);
      }
      showToast(`Serial added: ${serial.serialNo}`);
      return;
    }

    try {
      const product = await getProduct({
        productId: serial.productId,
        locationId: form.locationId,
        companyId: posSession.companyId,
      }).unwrap();

      const target = resolveTreeTargetLineId();
      if (target.insert) {
        dispatch(insertLineAtIndex({ index: target.index, id: target.lineId }));
      }

      dispatch(updateLine({
        id: target.lineId,
        patch: {
          productId: product.productId,
          productName: product.name,
          modelNo: product.modelNo ?? '',
          stock: formatStockDisplay(product.stockQty, product.unitName, product.productType),
          stockQty: isServiceProduct(product.productType) ? 0 : product.stockQty,
          productType: product.productType,
          unit: product.unitName ?? 'Pcs',
          unitPrice: product.lastPrice,
          warrantyDays: product.warrantyDays,
          isSerial: true,
          quantity: 1,
          serials: [{ serialNo: serial.serialNo, discount: serial.discountAmount, dbDiscount: serial.discountAmount }],
          discount: serial.discountAmount || 0,
          hasPriceSetup: product.hasPriceSetup === true,
        },
      }));
      dispatch(ensureTrailingEmptyRow());
      if (!salesWithoutPriceSetup && product.hasPriceSetup !== true) {
        showToast(
          `Row 1 has a product "${product.name}" which do not have price setup configuration`,
          '⚠',
        );
      }
      void applyPosSalesPrice(target.lineId, product.productId, 1);
      showToast(`Serial added: ${serial.serialNo}`);
    } catch {
      showToast('Failed to add serial product', '⚠');
    }
  }, [applyPosSalesPrice, dispatch, form.lines, form.locationId, getProduct, resolveTreeTargetLineId, salesWithoutPriceSetup, showToast]);

  const applyMultiScanItem = useCallback(async (item: MultiScanSearchItem | MultiScanResult) => {
    // In read-only mode only invoice lookup remains allowed (view another invoice).
    if (isInvoiceReadOnlyRef.current && item.type !== 'invoice') {
      showToast('This invoice is read-only — editing is not allowed', '⚠');
      return;
    }
    if (item.type === 'customer' && item.customer) {
      await selectCustomer(item.customer);
      showToast(`Customer: ${item.customer.buyerName ?? item.customer.name ?? ''}`);
      return;
    }

    if (item.type === 'salesPerson' && item.salesPerson) {
      dispatch(updateField({ key: 'employeeId', value: item.salesPerson.employeeId }));
      showToast(`Sales Person: ${item.salesPerson.name}`);
      return;
    }

    if (item.type === 'invoice' && item.invoiceNo) {
      try {
        await loadInvoiceByNo(item.invoiceNo);
      } catch {
        showToast('Failed to load invoice', '⚠');
      }
      return;
    }

    if (item.type === 'serial' && item.serial) {
      await applySerialScan(item.serial);
      return;
    }

    if (item.type === 'product') {
      try {
        const productDetail = 'product' in item && item.product
          ? item.product
          : await getProduct({
            productId: ('productId' in item ? item.productId : undefined) ?? 0,
            locationId: form.locationId,
            companyId: posSession.companyId,
          }).unwrap();

        if (!productDetail?.productId) {
          showToast('Product not found', '⚠');
          return;
        }

        const target = resolveTreeTargetLineId();
        if (target.insert) {
          dispatch(insertLineAtIndex({ index: target.index, id: target.lineId }));
        }
        await applyProductToLine(target.lineId, productDetail);
        dispatch(ensureTrailingEmptyRow());
        showToast(`Product: ${productDetail.name}`);
      } catch {
        showToast('Failed to load product', '⚠');
      }
    }
  }, [
    applyProductToLine,
    applySerialScan,
    dispatch,
    form.locationId,
    getProduct,
    loadInvoiceByNo,
    resolveTreeTargetLineId,
    selectCustomer,
    showToast,
  ]);

  const resolveScanTerm = useCallback(async (term: string): Promise<boolean> => {
    const trimmed = term.trim();
    if (!trimmed) return false;

    try {
      const exact = await multiScan({
        q: trimmed,
        companyId: posSession.companyId,
        locationId: form.locationId,
      }).unwrap();
      await applyMultiScanItem(exact);
      return true;
    } catch {
      /* exact match not found */
    }

    if (trimmed.length < 2) return false;

    try {
      const results = await searchMultiScan({
        q: trimmed,
        companyId: posSession.companyId,
        locationId: form.locationId,
        limit: 25,
      }).unwrap();

      if (results.length === 0) return false;
      if (results.length === 1) {
        await applyMultiScanItem(results[0]);
        return true;
      }
      setMultiScanPickItems(results);
      setMultiScanPickOpen(true);
      return true;
    } catch {
      return false;
    }
  }, [applyMultiScanItem, form.locationId, multiScan, searchMultiScan]);

  const openScanner = useCallback(() => {
    if (isInvoiceReadOnlyRef.current) {
      showToast('This invoice is read-only — editing is not allowed', '⚠');
      return;
    }
    setScanModalOpen(true);
  }, [showToast]);

  const onInvoiceSelect = useCallback(async (invoice: InvoiceSearchResult) => {
    try {
      await loadInvoiceByNo(invoice.invoiceNo);
    } catch {
      showToast('Failed to load invoice', '⚠');
    }
  }, [loadInvoiceByNo, showToast]);

  const onInvoiceClear = useCallback(() => {
    dispatch(updateField({ key: 'salesOrderId', value: undefined }));
    dispatch(updateField({ key: 'invoiceNo', value: '' }));
    dispatch(updateField({ key: 'salesOrderNo', value: '' }));
  }, [dispatch]);

  const onSalesPersonSelect = useCallback((salesPerson: SalesPerson) => {
    if (isInvoiceReadOnlyRef.current) return;
    if (!salesPersonEditable) return;
    dispatch(updateField({ key: 'employeeId', value: salesPerson.employeeId }));
  }, [dispatch, salesPersonEditable]);
  const onSalesPersonClear = useCallback(() => {
    if (isInvoiceReadOnlyRef.current) return;
    if (!salesPersonEditable) return;
    dispatch(updateField({ key: 'employeeId', value: 0 }));
  }, [dispatch, salesPersonEditable]);

  const lines = form.lines;
  const serialLine = lines.find((l) => l.id === serialLineId);

  const openInvoicePrint = useCallback((kind: 'pos' | 'report') => {
    const invoiceNo = form.invoiceNo.trim();
    if (!invoiceNo || !form.salesOrderId) {
      showToast('Load a saved invoice first, then print', '⚠');
      return;
    }
    if (kind === 'pos') setInvoicePosModalOpen(true);
    else setReportModalOpen(true);
  }, [form.invoiceNo, form.salesOrderId, showToast]);

  return (
    <div className="pos-shell">
      <div className="pos-page-intro">
        <div className="pos-page-head">
          <h1 className="pos-page-title">Point of Sales</h1>
          <p className="pos-page-sub">Create invoices, manage items, and process payments</p>
        </div>
      </div>

      <PosToolbar
        sidebarOpen={form.sidebarOpen}
        companyId={posSession.companyId}
        locationId={form.locationId}
        readOnly={isInvoiceReadOnly}
        onToggleSidebar={() => dispatch(toggleSidebar())}
        onMultiScanPick={(item) => void applyMultiScanItem(item)}
        onOpenScanner={openScanner}
        onHold={() => setHoldModalOpen(true)}
        onListView={() => setListViewModalOpen(true)}
      />

      <div className="body-wrap">
        <TreeSidebar
          open={form.sidebarOpen}
          nodes={productTree}
          companyId={posSession.companyId}
          locationId={form.locationId}
          onClose={() => dispatch(toggleSidebar())}
          onSelectModel={handleTreeProductSelect}
        />

        <div className="content">
          <div className="top-row">
            <div className="card">
              <div className="ch">
                <span className="dot" />
                Customer Info
                <button
                  type="button"
                  className="new-btn"
                  style={{ marginLeft: 'auto' }}
                  disabled={isInvoiceReadOnly}
                  onClick={() => {
                    if (isInvoiceReadOnly) return;
                    setCustomerModalOpen(true);
                  }}
                >
                  + New
                </button>
              </div>
              <div className="cb">
                <div className="fr" style={{ position: 'relative' }}>
                  <span className="fl">Customer</span>
                  <CustomerSearchInput
                    value={form.customerName}
                    companyId={posSession.companyId}
                    variant="name"
                    refreshKey={customerListRefresh}
                    selectedBuyerId={form.buyerId}
                    disabled={isInvoiceReadOnly}
                    onCommit={onCustomerNameCommit}
                    onSelect={selectCustomer}
                    onHoverEnter={(rect) => {
                      if (!form.buyerId) return;
                      setCustTip({ visible: true, x: rect.left, y: rect.bottom + 6 });
                    }}
                    onHoverLeave={() => setCustTip((t) => (t.visible ? { ...t, visible: false } : t))}
                  />
                </div>
                <div className="fr">
                  <span className="fl">Mobile No</span>
                  <CustomerSearchInput
                    value={form.mobile}
                    companyId={posSession.companyId}
                    variant="phone"
                    refreshKey={customerListRefresh}
                    selectedBuyerId={form.buyerId}
                    disabled={isInvoiceReadOnly}
                    onCommit={onMobileCommit}
                    onSelect={selectCustomer}
                  />
                </div>
                <div className="fr">
                  <span className="fl">Address</span>
                  <input
                    className="fv"
                    value={form.address}
                    disabled={isInvoiceReadOnly}
                    readOnly={isInvoiceReadOnly}
                    onChange={(e) => {
                      if (isInvoiceReadOnly) return;
                      dispatch(updateField({ key: 'address', value: e.target.value }));
                    }}
                  />
                </div>
                <div className="fr">
                  <span className="fl">Remarks</span>
                  <input
                    className="fv"
                    value={form.remarks}
                    placeholder="Saved to SalesOrder.Remarks"
                    disabled={isInvoiceReadOnly}
                    readOnly={isInvoiceReadOnly}
                    onChange={(e) => {
                      if (isInvoiceReadOnly) return;
                      dispatch(updateField({ key: 'remarks', value: e.target.value }));
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="ch"><span className="dot" style={{ background: 'var(--blue)' }} />Invoice Details</div>
              <div className="cb">
                <div className="fr">
                  <span className="fl">Invoice No</span>
                  <InvoiceSearchInput
                    value={selectedInvoice}
                    options={invoiceOptions}
                    onSearch={onInvoiceSearch}
                    onSelect={(inv) => void onInvoiceSelect(inv)}
                    onCommit={(invoiceNo) => void onInvoiceSelect({ invoiceNo, salesOrderId: '', customerName: '' })}
                    onClear={onInvoiceClear}
                  />
                </div>
                <div className="fr">
                  <span className="fl">Ledger Due</span>
                  <input className="fv mono red" value={formatNumber(form.ledgerDue)} readOnly />
                </div>
                <div className="fr" style={{ gap: 5 }}>
                  <span className="fl" style={{ flexShrink: 0 }}>Pay Mode</span>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <select
                      className="fv"
                      style={{ flex: 1, minWidth: 0 }}
                      value={form.paymentModeId > 0 ? form.paymentModeId : ''}
                      disabled={isInvoiceReadOnly || paymentModesLoading || paymentModesError}
                      onChange={(e) => {
                        if (isInvoiceReadOnly) return;
                        const id = Number(e.target.value) || 0;
                        if (!id) {
                          onPayModeClear();
                          return;
                        }
                        const mode = parentPaymentModes.find((m) => m.paymentModeId === id);
                        if (mode) onPayModeSelect(mode);
                      }}
                    >
                      <option value="">
                        {paymentModesLoading ? 'Loading pay modes...' : 'Select pay mode...'}
                      </option>
                      {parentPaymentModes.map((m) => (
                        <option key={m.paymentModeId} value={m.paymentModeId}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    {paymentModesError && (
                      <div style={{ fontSize: 10.5, color: 'var(--red)', display: 'flex', gap: 8, alignItems: 'center' }}>
                        Failed to load payment modes.
                        <button type="button" className="btn-ghost" style={{ padding: '0 6px', fontSize: 10.5 }} onClick={() => void refetchPaymentModes()}>
                          Retry
                        </button>
                      </div>
                    )}
                    {!paymentModesLoading && !paymentModesError && parentPaymentModes.length === 0 && (
                      <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>No payment modes configured.</div>
                    )}
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text3)', flexShrink: 0, whiteSpace: 'nowrap' }}>Sub Pay Mode</span>
                  <select
                    className="fv"
                    style={{ flex: 1, minWidth: 0 }}
                    value={form.subPaymentModeId && form.subPaymentModeId > 0 ? form.subPaymentModeId : ''}
                    disabled={isInvoiceReadOnly || subPaymentModes.length === 0 || paymentModesLoading || paymentModesError}
                    onChange={(e) => {
                      if (isInvoiceReadOnly) return;
                      const id = Number(e.target.value) || 0;
                      if (!id) {
                        onSubPayModeClear();
                        return;
                      }
                      const mode = subPaymentModes.find((m) => m.paymentModeId === id);
                      if (mode) onSubPayModeSelect(mode);
                    }}
                  >
                    <option value="">{subPaymentModes.length === 0 ? '— N/A —' : 'Select sub pay mode...'}</option>
                    {subPaymentModes.map((m) => (
                      <option key={m.paymentModeId} value={m.paymentModeId}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="fr" style={{ gap: 5 }}>
                  <span className="fl" style={{ flexShrink: 0 }}>Ref No</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <ReferenceSearchInput
                      value={selectedReference}
                      options={references}
                      disabled={isInvoiceReadOnly}
                      onSelect={onReferenceSelect}
                      onClear={onReferenceClear}
                    />
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text3)', flexShrink: 0, whiteSpace: 'nowrap' }}>Event Type</span>
                  <select
                    className="fv"
                    style={{ flex: 1, minWidth: 0 }}
                    value={form.biznessEventTypeId > 0 ? form.biznessEventTypeId : ''}
                    disabled={isInvoiceReadOnly}
                    onChange={(e) => {
                      if (isInvoiceReadOnly) return;
                      dispatch(updateField({ key: 'biznessEventTypeId', value: Number(e.target.value) || 0 }));
                    }}
                  >
                    <option value="">Select event type...</option>
                    {biznessEventTypes.map((t) => (
                      <option key={t.biznessEventTypeId} value={t.biznessEventTypeId}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="ch"><span className="dot" style={{ background: 'var(--orange)' }} />Sales Information</div>
              <div className="cb">
                <div className="fr">
                  <span className="fl">Inv. Date</span>
                  <input
                    className="fv"
                    type="datetime-local"
                    value={form.invoiceDate}
                    readOnly={!invoiceDateEditable || isInvoiceReadOnly}
                    disabled={!invoiceDateEditable || isInvoiceReadOnly}
                    onChange={(e) => {
                      if (!invoiceDateEditable || isInvoiceReadOnly) return;
                      dispatch(updateField({ key: 'invoiceDate', value: e.target.value }));
                    }}
                  />
                  <span className="fl" style={{ marginLeft: 6 }}>Promised Date</span>
                  <input
                    className="fv"
                    type="datetime-local"
                    value={form.paymentPromiseDate}
                    readOnly={isInvoiceReadOnly}
                    disabled={isInvoiceReadOnly}
                    onChange={(e) => {
                      if (isInvoiceReadOnly) return;
                      dispatch(updateField({ key: 'paymentPromiseDate', value: e.target.value }));
                    }}
                  />
                </div>
                <div className="fr" style={{ position: 'relative' }}>
                  <span className="fl">Sales Person</span>
                  <SalesPersonSearchInput
                    value={selectedSalesPerson}
                    options={salesPersons}
                    disabled={!salesPersonEditable || isInvoiceReadOnly}
                    onSelect={onSalesPersonSelect}
                    onClear={onSalesPersonClear}
                  />
                </div>
                <div className="fr" style={{ gap: 5 }}>
                  <span className="fl" style={{ flexShrink: 0 }}>Inv. Discount</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <DiscountInput
                      value={form.invoiceDiscount}
                      type={form.invoiceDiscountType}
                      maxAmount={totalAmt}
                      disabled={isInvoiceReadOnly}
                      onChange={(value, type) => {
                        if (isInvoiceReadOnly) return;
                        dispatch(updateField({ key: 'invoiceDiscount', value }));
                        dispatch(updateField({ key: 'invoiceDiscountType', value: type }));
                      }}
                      onExceedTotalBill={() =>
                        showToast('Inv. discount cannot be greater than Total bill', '⚠')
                      }
                    />
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text3)', flexShrink: 0, whiteSpace: 'nowrap' }}>Project</span>
                  <select
                    className="fv"
                    style={{ flex: 1, minWidth: 0 }}
                    value={form.projectId > 0 ? form.projectId : ''}
                    disabled={isInvoiceReadOnly}
                    onChange={(e) => {
                      if (isInvoiceReadOnly) return;
                      dispatch(updateField({ key: 'projectId', value: Number(e.target.value) || 0 }));
                    }}
                  >
                    <option value="">Select project...</option>
                    {projects.map((p) => (
                      <option key={p.projectId} value={p.projectId}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="fr" style={{ gap: 5 }}>
                  <span className="fl">VAT / AIT</span>
                  <SoftZeroNumberInput
                    value={form.vatAit}
                    disabled={isInvoiceReadOnly}
                    onCommit={(value) => {
                      if (isInvoiceReadOnly) return;
                      dispatch(updateField({ key: 'vatAit', value }));
                    }}
                  />
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text3)', whiteSpace: 'nowrap' }}>Others Charge</span>
                  <SoftZeroNumberInput
                    value={form.othersCharge}
                    disabled={isInvoiceReadOnly}
                    onCommit={(value) => {
                      if (isInvoiceReadOnly) return;
                      dispatch(updateField({ key: 'othersCharge', value }));
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <PosItemsTable
            lines={lines}
            locationId={form.locationId}
            companyId={posSession.companyId}
            readOnly={isInvoiceReadOnly}
            onLineChange={onLineChange}
            onMarkDeleted={onMarkDeleted}
            onEnsureTrailingRow={onEnsureTrailingRow}
            onProductSelect={onProductSelect}
            onProductNameCommit={onProductNameCommit}
            onProductFocus={onProductFocus}
            onProductBlur={onProductBlur}
            onQuantityBlur={onQuantityBlur}
            onUnitPriceBlur={onUnitPriceBlur}
            onSelectProductFromTree={onSelectProductFromTree}
            onRowHover={handleRowHover}
            onOpenSerial={setSerialLineId}
            onClear={onClearAll}
            onFocusSave={focusSaveButton}
          />

          <div className="bot">
            <ActionsPanel
              onSave={() => void handleSave()}
              onInvoicePos={() => openInvoicePrint('pos')}
              onHold={() => void handleHoldInvoice()}
              onClear={onClearAll}
              onReport={() => openInvoicePrint('report')}
              onChallan={() => setChallanModalOpen(true)}
              onExchange={() => {
                if (isInvoiceReadOnly) return;
                setExchangeModalOpen(true);
              }}
              onMore={() => setMoreModalOpen(true)}
              saving={saving}
              saveDisabled={saveLocked || isInvoiceReadOnly}
              saveButtonRef={saveButtonRef}
            />
            <PaymentPanel
              totalBill={grandTotal}
              givenAmount={form.givenAmount}
              changeAmount={changeAmount}
              readOnly={isInvoiceReadOnly}
              onGivenAmountChange={(v) => {
                if (isInvoiceReadOnly) return;
                dispatch(updateField({ key: 'givenAmount', value: v }));
              }}
            />
            <SummaryPanel
              totalQty={totalQty}
              totalAmt={totalAmt}
              invoiceDiscount={discountAmount}
              vatAit={form.vatAit}
              othersCharge={form.othersCharge}
              grandTotal={grandTotal}
            />
          </div>
        </div>
      </div>

      <StatusBar connected={health?.status === 'Connected'} invoiceNo={form.invoiceNo} customerName={form.customerName} />

      <CustomerStatsTip visible={custTip.visible} stats={customerStats} x={custTip.x} y={custTip.y} />
      <PriceHistoryTip visible={!!hoverLineId} product={hoverProduct} history={hoverHistory} x={tipPos.x} y={tipPos.y} />

      <CustomerSetupModal
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        saving={creatingCustomer}
        onSave={async (data) => {
          const customer = await createCustomer({
            ...data,
            employeeId: form.employeeId > 0 ? form.employeeId : posSession.employeeId,
            companyId: posSession.companyId,
            locationId: form.locationId,
            entryBy: posSession.securityUserId,
          }).unwrap();
          await selectCustomer({
            buyerId: customer.buyerId,
            buyerName: customer.name,
            name: customer.name,
            phone: customer.phone ?? '',
            address: customer.address,
            employeeId: customer.employeeId,
            employeeName: customer.employeeName ?? customer.salesPersonName,
          });
          setCustomerListRefresh((k) => k + 1);
          setCustomerModalOpen(false);
          showToast('Customer created', '✓');
        }}
      />

      <MixedModeModal
        open={mixedModalOpen}
        grandTotal={grandTotal}
        initial={form.mixedPayment}
        banks={banks}
        companyId={posSession.companyId}
        cashBackOfferEnabled={cashBackOfferEnabled}
        chargeFromBankSetup={chargeFromBankSetup}
        crossCheckEnabled={mixedModeCrossCheck}
        onClose={closeMixedMode}
        onConfirm={isInvoiceReadOnly ? () => undefined : confirmMixedMode}
      />

      <CardPaymentModal
        open={cardModalOpen}
        defaultBank={selectedSubPayMode?.name}
        banks={banks}
        initial={form.cardPayment}
        onClose={closeCardMode}
        onConfirm={isInvoiceReadOnly ? () => undefined : confirmCardMode}
      />

      <SerialModal
        open={!!serialLineId}
        productId={serialLine?.productId}
        productName={serialLine?.productName}
        locationId={form.locationId}
        initialSerials={serialLine?.serials ?? []}
        initialWarrantyDays={serialLine?.warrantyDays ?? 365}
        initialQuantity={serialLine?.quantity ?? 0}
        stockQty={isServiceProduct(serialLine?.productType) ? 0 : (serialLine?.stockQty ?? 0)}
        onClose={() => setSerialLineId(null)}
        onToast={showToast}
        onConfirm={(result) => {
          if (isInvoiceReadOnlyRef.current) return;
          if (!serialLineId) return;
          const lineId = serialLineId;
          const productId = serialLine?.productId;
          dispatch(updateLine({
            id: lineId,
            patch: {
              serials: result.serials,
              quantity: result.quantity,
              warrantyDays: result.warrantyDays,
              discount: result.quantity > 0
                ? result.lineDiscount / result.quantity
                : 0,
            },
          }));
          setSerialLineId(null);
          if (productId) {
            void applyPosSalesPrice(lineId, productId, result.quantity);
          }
        }}
      />

      <ReceiptModal open={!!receipt} data={receipt} onClose={() => setReceipt(null)} />

      <ExchangeModal
        open={exchangeModalOpen}
        onClose={() => setExchangeModalOpen(false)}
        invoiceNo={form.invoiceNo}
        customerName={form.customerName}
        invoiceDate={form.invoiceDate}
        lines={form.lines}
      />
      <MoreActionsModal open={moreModalOpen} onClose={() => setMoreModalOpen(false)} />

      <InvoicePosPrintModal
        open={invoicePosModalOpen}
        onClose={() => setInvoicePosModalOpen(false)}
        salesPersonName={selectedSalesPerson?.name ?? '—'}
      />

      <InvoiceReportModal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        payModeName={selectedPayMode?.name ?? '—'}
        salesPersonName={selectedSalesPerson?.name ?? '—'}
        referenceName={selectedReference?.name ?? '—'}
      />

      <DeliveryChallanModal
        open={challanModalOpen}
        onClose={() => setChallanModalOpen(false)}
      />

      <ScanModal
        open={scanModalOpen}
        sessionId={scanSessionId}
        relayReady={scanRelayReady}
        remoteFrame={remoteScanFrame}
        remoteLive={remoteScanLive}
        onClose={() => setScanModalOpen(false)}
        onScanTerm={resolveScanTerm}
        registerRemoteScanHandler={registerRemoteScanHandler}
      />

      <MultiScanPickModal
        open={multiScanPickOpen}
        items={multiScanPickItems}
        onClose={() => setMultiScanPickOpen(false)}
        onPick={(item) => void applyMultiScanItem(item)}
      />

      <HoldInvoiceModal
        open={holdModalOpen}
        onClose={() => setHoldModalOpen(false)}
        items={heldInvoices}
        loading={loadingHeld}
        onHoldCurrent={() => void handleHoldInvoice(true)}
        onRestore={(id) => void handleRestoreHeld(id)}
        onDelete={(id) => void handleDeleteHeld(id)}
      />

      <TodayInvoiceListModal
        open={listViewModalOpen}
        onClose={() => setListViewModalOpen(false)}
        companyId={posSession.companyId}
        locationId={form.locationId}
        employeeId={posSession.employeeId}
        onOpenInvoice={async (invoiceNo) => {
          try {
            await loadInvoiceByNo(invoiceNo);
          } catch {
            showToast('Failed to load invoice', '⚠');
          }
        }}
      />
    </div>
  );
}
