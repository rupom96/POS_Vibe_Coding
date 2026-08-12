import { useCallback, useEffect, useRef } from 'react';
import { useAppSelector } from '../../../../app/hooks';
import { posSession } from '../../../../config/posSession';
import { useLazyGetInvoicePrintContextQuery } from '../../api/posApi';
import { useInvoiceTotals } from '../bottom/SummaryPanel';
import { amountInWords } from '../../utils/amountInWords';
import { printHtmlElement } from '../../utils/printHtml';
import {
  REPORT_WARRANTY_NOTES,
  contactLine,
  filledPrintLines,
  formatPrintDate,
  formatPrintDateShort,
  formatPrintMoney,
  formatPrintTime,
  lineGross,
} from './invoicePrintShared';

function RprmKv({
  label,
  value,
  strong,
}: {
  label: string;
  value?: string | number | null;
  strong?: boolean;
}) {
  return (
    <div className="rprm-kv">
      <span className="k">{label}</span>
      <span className="s">:</span>
      <span className={strong ? 'v strong' : 'v'}>{value ?? ''}</span>
    </div>
  );
}

function DuesRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="rprm-dues-row">
      <span className="k">{label}</span>
      <span className="s">:</span>
      <span className="a">{formatPrintMoney(amount)}</span>
    </div>
  );
}

export function InvoiceReportModal({
  open,
  onClose,
  payModeName,
  salesPersonName,
}: {
  open: boolean;
  onClose: () => void;
  payModeName: string;
  salesPersonName: string;
  /** kept for call-site compatibility */
  referenceName?: string;
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
      `Report ${form.invoiceNo.trim() || 'Invoice'}`,
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
      <div className="md pos-doc-shell pos-print-shell-a4">
        <div className="mh pos-doc-mh-blue no-print">
          <span className="mhi">📊</span>
          <span className="mt" style={{ color: '#fff' }}>Invoice Report</span>
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

          <div ref={sheetRef} className="rprm">
            <div className="rprm-co">{company?.name || '—'}</div>
            {company?.address ? <div className="rprm-addr">{company.address}</div> : null}
            <div className="rprm-phone">{contactLine(company)}</div>

            <div className="rprm-titlebar">Invoice/ Bill</div>

            <div className="rprm-meta">
              <div className="rprm-meta-left">
                <RprmKv label="Sold To" value={form.customerName} strong />
                {form.address ? (
                  <div className="rprm-kv rprm-kv-sub">
                    <span className="k" />
                    <span className="s" />
                    <span className="v">{form.address}</span>
                  </div>
                ) : null}
                <RprmKv label="Contact No" value={form.mobile} />
                <RprmKv label="Invoice No" value={form.invoiceNo} />
                <RprmKv label="S. Order No" value={salesOrderNo} />
                <RprmKv label="Remarks" value={form.remarks} />
              </div>
              <div className="rprm-meta-right">
                <RprmKv label="Date" value={formatPrintDate(form.invoiceDate)} />
                <RprmKv label="Sold By" value={soldBy} />
                <RprmKv label="Verified By" value={verifiedBy} />
                <RprmKv label="Billing By" value={billingBy} />
                <RprmKv label="Promise Mode" value={payModeName} />
                <RprmKv label="Sales Person By" value={soldBy} />
              </div>
            </div>

            <table className="rprm-table">
              <thead>
                <tr>
                  <th className="col-sl">S/L</th>
                  <th>Item Particulars</th>
                  <th className="col-wd">Warranty Days</th>
                  <th className="col-up">Unit Price</th>
                  <th className="col-qty">Quantity</th>
                  <th className="col-tot">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="c" style={{ padding: 12 }}>—</td></tr>
                ) : (
                  rows.map((line, i) => {
                    const serials = (line.serials ?? [])
                      .map((s) => s.serialNo?.trim())
                      .filter(Boolean);
                    return (
                      <tr key={line.id}>
                        <td className="c">{i + 1}</td>
                        <td className="l rprm-prod">
                          {line.productName}
                          {serials.length > 0 ? (
                            <>
                              <br />
                              <span className="rprm-serials">{serials.join(', ')}</span>
                            </>
                          ) : null}
                        </td>
                        <td className="c">{line.warrantyDays || 0}</td>
                        <td className="r">{formatPrintMoney(line.unitPrice)}</td>
                        <td className="c">{line.quantity}</td>
                        <td className="r">{formatPrintMoney(lineGross(line))}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            <div className="rprm-below">
              <div className="rprm-below-left">
                <div className="rprm-words">
                  <span className="rprm-words-lab">Amount In Words : </span>
                  <span className="rprm-words-val">{words}</span>
                </div>
                <div className="rprm-dues-box">
                  <DuesRow label="Previous Due" amount={previousDue} />
                  <DuesRow label="Sales Amount" amount={salesAmount} />
                  <DuesRow label="Collected Amount" amount={collected} />
                  <DuesRow label="Outsanding Amount" amount={outstanding} />
                </div>
              </div>
              <div className="rprm-tots">
                <div className="rprm-tots-row">
                  <span className="lab">TOTAL :</span>
                  <span className="amt">{formatPrintMoney(totalAmt)}</span>
                </div>
                <div className="rprm-tots-row">
                  <span className="lab">Discount:</span>
                  <span className="amt">{formatPrintMoney(discountAmount)}</span>
                </div>
                <div className="rprm-tots-row grand">
                  <span className="lab">Grand TOTAL :</span>
                  <span className="amt">{formatPrintMoney(grandTotal)}</span>
                </div>
              </div>
            </div>

            <div className="rprm-signs">
              <div>
                <div className="rprm-sign-line" />
                <div className="rprm-sign-lab">Received with good condition By</div>
              </div>
              <div>
                <div className="rprm-sign-line" />
                <div className="rprm-sign-lab">Check By</div>
              </div>
              <div>
                <div className="rprm-sign-line" />
                <div className="rprm-sign-lab">Authorised Signature And Company Stamp</div>
              </div>
            </div>

            <div className="rprm-warranty">
              {REPORT_WARRANTY_NOTES.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>

            <div className="rprm-footer">
              <span>Print Date: {formatPrintDateShort(now)}</span>
              <span>Print Time: {formatPrintTime(now)}</span>
              <span>www.databizsoftware.com</span>
              <span className="r">Page 1 of 1</span>
            </div>

            {isFetching && (
              <div className="no-print" style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>
                Loading letterhead…
              </div>
            )}
          </div>
        </div>

        <div className="mf no-print">
          <button type="button" className="bs" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
