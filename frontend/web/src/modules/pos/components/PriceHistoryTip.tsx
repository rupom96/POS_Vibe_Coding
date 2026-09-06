import type { PriceHistoryItem, ProductDetail } from '../types';
import { formatNumber } from '../utils/format';

const SALE_RANK_LABELS = ['Last', '2nd last', '3rd last'] as const;

export function PriceHistoryTip({
  visible,
  product,
  history,
  x,
  y,
  showCost = false,
  buyerId,
}: {
  visible: boolean;
  product?: ProductDetail;
  history: PriceHistoryItem[];
  x: number;
  y: number;
  showCost?: boolean;
  /** When set, empty history means no prior sales for this customer (no list-price fallback). */
  buyerId?: number;
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
              <div key={`${h.label}-${i}`} className="pt-price">
                <div className="pt-price-rank">{SALE_RANK_LABELS[i] ?? h.label}</div>
                <div className={`pt-price-val${i === 0 ? ' latest' : ''}`}>
                  {formatNumber(h.value)}
                </div>
              </div>
            ))
          ) : buyerId && buyerId > 0 ? (
            <div className="pt-cost-empty">No prior sales for this customer</div>
          ) : (
            <div className="pt-cost-empty">Select customer to see sale history</div>
          )}
        </div>
      </div>
      {showCost ? (
        <>
          <div className="pt-divider" />
          <div className="pt-section">
            <div className="pt-label">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2.2">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
              Cost Info
            </div>
            {product.hasCurrentStock === false ? (
              <div className="pt-cost-empty">No existence in current stock</div>
            ) : (
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
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
