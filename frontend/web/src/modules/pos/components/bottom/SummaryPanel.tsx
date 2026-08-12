import { useMemo } from 'react';
import type { InvoiceLine } from '../../types';
import { calcLineTotal, formatCurrency, formatNumber } from '../../utils/format';

export function useInvoiceTotals(
  lines: InvoiceLine[],
  invoiceDiscount: number,
  vatAit: number,
  othersCharge: number,
  givenAmount: number,
  invoiceDiscountType: 'Amount' | 'Percentage' = 'Amount',
) {
  return useMemo(() => {
    let totalQty = 0;
    let totalAmt = 0;

    lines.forEach((line) => {
      if (!line.productName.trim()) return;
      totalQty += line.quantity;
      totalAmt += calcLineTotal(line.quantity, line.unitPrice, line.discount, line.vatPercent, line.taxPercent);
    });

    const discountAmount = invoiceDiscountType === 'Percentage'
      ? (totalAmt * invoiceDiscount) / 100
      : invoiceDiscount;
    const grandTotal = totalAmt - discountAmount + vatAit + othersCharge;
    const changeAmount = givenAmount > grandTotal ? givenAmount - grandTotal : 0;

    return { totalQty, totalAmt, grandTotal, changeAmount, discountAmount };
  }, [lines, invoiceDiscount, invoiceDiscountType, vatAit, othersCharge, givenAmount]);
}

export function SummaryPanel({
  totalQty,
  totalAmt,
  invoiceDiscount,
  vatAit,
  othersCharge,
  grandTotal,
}: {
  totalQty: number;
  totalAmt: number;
  invoiceDiscount: number;
  vatAit: number;
  othersCharge: number;
  grandTotal: number;
}) {
  return (
    <div className="bc">
      <div className="bch">Summary</div>
      <div className="bcb">
        <div className="tl">
          <span className="tl-l">Total Qty</span>
          <span className="tl-v">{totalQty} Pcs</span>
        </div>
        <div className="tl">
          <span className="tl-l">Total Amount</span>
          <span className="tl-v">{formatCurrency(totalAmt)}</span>
        </div>
        <div className="tl">
          <span className="tl-l">Discount</span>
          <span className="tl-v dis">— {formatNumber(invoiceDiscount)}</span>
        </div>
        <div className="tl">
          <span className="tl-l">VAT / AIT</span>
          <span className="tl-v mut">+ {formatNumber(vatAit)}</span>
        </div>
        <div className="tl">
          <span className="tl-l">Others Charge</span>
          <span className="tl-v mut">+ {formatNumber(othersCharge)}</span>
        </div>
        <div className="tl grand">
          <span className="tl-l" style={{ fontWeight: 700, color: 'var(--text)' }}>
            Grand Total
          </span>
          <span className="tl-v acc">{formatCurrency(grandTotal)}</span>
        </div>
      </div>
    </div>
  );
}
