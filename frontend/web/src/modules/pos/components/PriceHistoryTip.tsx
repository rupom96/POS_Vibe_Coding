import type { PriceHistoryItem, ProductDetail } from '../types';
import { formatNumber } from '../utils/format';

export function PriceHistoryTip({
  visible,
  product,
  history,
  x,
  y,
}: {
  visible: boolean;
  product?: ProductDetail;
  history: PriceHistoryItem[];
  x: number;
  y: number;
}) {
  if (!visible || !product) return null;

  return (
    <div className={`price-tip show`} style={{ left: x, top: y }}>
      <div className="pt-product-name">{product.name}</div>
      <div className="pt-section">
        <div className="pt-label">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" strokeWidth="2.2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          Last 3 Sale Prices
        </div>
        <div className="pt-prices">
          {history.length > 0 ? (
            history.map((h, i) => (
              <div key={h.label} className="pt-price">
                <div className="pt-price-rank">{h.label}</div>
                <div className={`pt-price-val${i === 0 ? ' latest' : ''}`}>
                  {formatNumber(h.value)}
                </div>
              </div>
            ))
          ) : (
            <div className="pt-price">
              <div className="pt-price-rank">List</div>
              <div className="pt-price-val latest">{formatNumber(product.lastPrice)}</div>
            </div>
          )}
        </div>
      </div>
      <div className="pt-divider" />
      <div className="pt-section">
        <div className="pt-label">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2.2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
          Cost Info
        </div>
        <div className="pt-costs">
          <div className="pt-cost">
            <div className="pt-cost-label">Min</div>
            <div className="pt-cost-val min">৳ {formatNumber(product.costMin ?? 0)}</div>
          </div>
          <div className="pt-cost">
            <div className="pt-cost-label">Max</div>
            <div className="pt-cost-val max">৳ {formatNumber(product.costMax ?? 0)}</div>
          </div>
          <div className="pt-cost">
            <div className="pt-cost-label">Avg</div>
            <div className="pt-cost-val avg">৳ {formatNumber(product.costAvg ?? 0)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
