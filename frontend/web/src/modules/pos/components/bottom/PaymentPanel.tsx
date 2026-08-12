import { formatNumber } from '../../utils/format';

export function PaymentPanel({
  totalBill,
  givenAmount,
  changeAmount,
  readOnly = false,
  onGivenAmountChange,
}: {
  totalBill: number;
  givenAmount: number;
  changeAmount: number;
  readOnly?: boolean;
  onGivenAmountChange: (value: number) => void;
}) {
  return (
    <div className="bc">
      <div className="bch">Payment</div>
      <div className="pay-wrap">
        <div className="pay-row">
          <div className="pay-big pay-bill">
            <div className="pay-label">Total Bill (Tk)</div>
            <span className="pay-big-val">{formatNumber(totalBill)}</span>
          </div>
        </div>
        <div className="pay-row">
          <div className="pay-big">
            <div className="pay-label">Given Amt (Tk)</div>
            <input
              className="pay-big-inp"
              type="number"
              value={givenAmount || ''}
              placeholder="0"
              readOnly={readOnly}
              disabled={readOnly}
              onChange={(e) => {
                if (readOnly) return;
                onGivenAmountChange(Number(e.target.value) || 0);
              }}
            />
          </div>
        </div>
        <div className="pay-row">
          <div className="pay-big chg">
            <div className="pay-label">Change Amt</div>
            <span className="pay-big-val chg">{formatNumber(changeAmount)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
