import { useCallback, useEffect, useRef } from 'react';
import { useAppSelector } from '../../../../app/hooks';
import { posSession } from '../../../../config/posSession';
import { useLazyGetInvoicePrintContextQuery } from '../../api/posApi';
import { useInvoiceTotals } from '../bottom/SummaryPanel';
import { amountInWords } from '../../utils/amountInWords';
import { printHtmlElement } from '../../utils/printHtml';
import {
  contactLine,
  filledPrintLines,
  formatPrintDate,
  formatPrintDateShort,
  formatPrintMoney,
  formatPrintTime,
  lineGross,
} from './invoicePrintShared';

function PosKv({
  label,
  value,
  strong,
}: {
  label: string;
  value?: string | number | null;
  strong?: boolean;
}) {
  return (
    <div className="posa5-kv">
      <span className="k">{label}</span>
      <span className="s">:</span>
      <span className={strong ? 'v strong' : 'v'}>{value ?? ''}</span>
    </div>
  );
}

function DuesRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="posa5-dues-row">
      <span className="k">{label}</span>
      <span className="s">:</span>
      <span className="a">{formatPrintMoney(amount)}</span>
    </div>
  );
}

export function InvoicePosPrintModal({
  open,
  onClose,
  salesPersonName,
}: {
  open: boolean;
  onClose: () => void;
  salesPersonName: string;
}) {
  const form = useAppSelector((s) => s.pos);
  const sheetRef = useRef<HTMLDivElement>(null);
  const { totalAmt, grandTotal, discountAmount } = useInvoiceTotals(
    form.lines,
    form.invoiceDiscount,
    form.vatAit,
    form.othersCharge,
    form.givenAmount,
    form.invoiceDiscountType,
  );
  const [fetchContext, { data: ctx, isFetching, isError }] = useLazyGetInvoicePrintContextQuery();

  useEffect(() => {
    if (!open || !form.invoiceNo.trim()) return;
    void fetchContext({
      invoiceNo: form.invoiceNo.trim(),
      companyId: posSession.companyId,
      locationId: form.locationId,
    });
  }, [open, form.invoiceNo, form.locationId, fetchContext]);

  const handlePrint = useCallback(() => {
    const ok = printHtmlElement(
      sheetRef.current,
      `Invoice ${form.invoiceNo.trim() || 'POS'}`,
    );
    if (!ok) window.print();
  }, [form.invoiceNo]);

  if (!open) return null;

  const rows = filledPrintLines(form.lines);
  const company = ctx?.company;
  // Previous Due = ledger due loaded on customer select (frontend).
  const previousDue = form.ledgerDue ?? 0;
  // Sales Amount = SalesOrder.TotalAmount from backend; fallback to current POS grand total.
  const salesAmount = ctx?.salesAmount ?? grandTotal;
  // Collected Amount = sum of approved (Approved='Y') collections against this InvoiceNo.
  const collected = ctx?.collectedAmount ?? 0;
  // Outstanding = (Previous Due + Sales Amount) - Collected Amount
  const outstanding = previousDue + salesAmount - collected;
  const salesOrderNo = ctx?.salesOrderNo || form.salesOrderNo || '';
  const soldBy = salesPersonName || '';
  const verifiedBy = ctx?.verifiedByName || '';
  const billingBy = ctx?.billingByName || '';
  const now = new Date();
  const words = amountInWords(grandTotal);

  return (
    <div className="mo active pos-doc-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="md pos-doc-shell pos-print-shell-a5">
        <div className="mh pos-doc-mh-blue no-print">
          <span className="mhi">🖨️</span>
          <span className="mt" style={{ color: '#fff' }}>Invoice POS</span>
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <button type="button" className="pos-doc-head-btn" onClick={handlePrint} disabled={isFetching}>
              🖨️ Print
            </button>
            <button type="button" className="mc pos-doc-head-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="mb pos-doc-body pos-print-area" style={{ padding: 0, overflowY: 'auto', flex: 1, background: '#e5e7eb' }}>
          {isError && (
            <div className="no-print" style={{ padding: 12, color: '#b91c1c', fontSize: 12 }}>
              Could not load company / collection details for this invoice.
            </div>
          )}

          <div ref={sheetRef} className="posa5">
            <div className="posa5-co">{company?.name || '—'}</div>
            {company?.address ? <div className="posa5-addr">{company.address}</div> : null}
            <div className="posa5-phone">{contactLine(company)}</div>

            <div className="posa5-titlebar">Invoice/ Bill</div>

            <div className="posa5-meta">
              <div className="posa5-meta-left">
                <PosKv label="Sold To" value={form.customerName} strong />
                <PosKv label="Address" value={form.address} />
                <PosKv label="Contact No" value={form.mobile} />
                <PosKv label="Invoice No" value={form.invoiceNo} />
                <PosKv label="S. Order No" value={salesOrderNo} />
                <PosKv label="Remarks" value={form.remarks} />
              </div>
              <div className="posa5-meta-right">
                <PosKv label="Date" value={formatPrintDate(form.invoiceDate)} />
                <PosKv label="Sold By" value={soldBy} />
                <PosKv label="Verified By" value={verifiedBy} />
                <PosKv label="Billing By" value={billingBy} />
                <PosKv label="Sales" value={soldBy} />
              </div>
            </div>

            <table className="posa5-table">
              <thead>
                <tr>
                  <th className="col-sl">S/L</th>
                  <th>Item Particulars</th>
                  <th className="col-qty">Quantity</th>
                  <th className="col-up">Unit Price</th>
                  <th className="col-tot">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={5} className="c" style={{ padding: 12 }}>—</td></tr>
                ) : (
                  rows.map((line, i) => (
                    <tr key={line.id}>
                      <td className="c">{i + 1}</td>
                      <td className="l">
                        <div className="posa5-prod">{line.productName}</div>
                        <div className="posa5-wday">W. Day&nbsp;&nbsp;{line.warrantyDays || 0}</div>
                      </td>
                      <td className="c">{line.quantity}</td>
                      <td className="r">{formatPrintMoney(line.unitPrice)}</td>
                      <td className="r">{formatPrintMoney(lineGross(line))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="posa5-below-table">
              <div className="posa5-words">
                <span className="posa5-words-lab">Amount In Words : </span>
                <span className="posa5-words-val">{words}</span>
              </div>
              <div className="posa5-tots">
                <div className="posa5-tots-row">
                  <span className="lab">TOTAL :</span>
                  <span className="amt">{formatPrintMoney(totalAmt)}</span>
                </div>
                <div className="posa5-tots-row">
                  <span className="lab">Discount:</span>
                  <span className="amt">{formatPrintMoney(discountAmount)}</span>
                </div>
                <div className="posa5-tots-row">
                  <span className="lab">Grand TOTAL :</span>
                  <span className="amt">{formatPrintMoney(grandTotal)}</span>
                </div>
              </div>
            </div>

            <div className="posa5-dues-wrap">
              <div className="posa5-dues-box">
                <DuesRow label="Previous Due" amount={previousDue} />
                <DuesRow label="Sales Amount" amount={salesAmount} />
                <DuesRow label="Collected Amount" amount={collected} />
                <DuesRow label="Outstanding Amount" amount={outstanding} />
              </div>
            </div>

            <div className="posa5-signs">
              <div>
                <div className="posa5-sign-line" />
                <div className="posa5-sign-lab">Received with good condition By</div>
              </div>
              <div>
                <div className="posa5-sign-line" />
                <div className="posa5-sign-lab">Authorised Signature</div>
              </div>
            </div>

            <hr className="posa5-footer-rule" />
            <div className="posa5-footer">
              <span>Print Date: {formatPrintDateShort(now)}</span>
              <span className="c">Print Time: {formatPrintTime(now)}</span>
              <span className="r">www.databizsoftware.com</span>
            </div>

            {isFetching && <div className="no-print" style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>Loading letterhead…</div>}
          </div>
        </div>

        <div className="mf no-print">
          <button type="button" className="bs" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
