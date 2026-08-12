import type { CustomerStats } from '../types';
import { formatCurrency } from '../utils/format';

export function CustomerStatsTip({
  visible,
  stats,
  x,
  y,
}: {
  visible: boolean;
  stats?: CustomerStats;
  x: number;
  y: number;
}) {
  if (!visible || !stats) return null;

  const collectionRate =
    stats.totalSales > 0 ? Math.round((stats.totalCollected / stats.totalSales) * 100) : 100;
  const salesRate = Math.min(100, stats.invoiceCount * 10);
  const circumference = 188.5;
  const salesDash = (salesRate / 100) * circumference;
  const collectDash = (collectionRate / 100) * circumference;

  return (
    <div
      className={`cst-tip show`}
      style={{ left: x, top: y, pointerEvents: 'none' }}
    >
      <div className="cst-header">
        <div className="cst-avatar">{stats.customerName.charAt(0).toUpperCase()}</div>
        <div className="cst-info">
          <div className="cst-name">{stats.customerName}</div>
          <div className="cst-since">Customer since {stats.sinceYear}</div>
        </div>
        <div className="cst-badge good">{stats.invoiceCount} inv</div>
      </div>
      <div className="cst-charts">
        <div className="cst-chart-wrap">
          <svg className="cst-arc" viewBox="0 0 80 80">
            <circle className="cst-arc-bg" cx="40" cy="40" r="30" />
            <circle
              className="cst-arc-fill sales-arc"
              cx="40"
              cy="40"
              r="30"
              strokeDasharray={`${salesDash} ${circumference}`}
              strokeDashoffset="47.1"
            />
            <text x="40" y="37" className="cst-arc-pct">
              {salesRate}%
            </text>
            <text x="40" y="50" className="cst-arc-lbl">
              Sales
            </text>
          </svg>
          <div className="cst-chart-sub">{formatCurrency(stats.totalSales)}</div>
        </div>
        <div className="cst-vdivider" />
        <div className="cst-chart-wrap">
          <svg className="cst-arc" viewBox="0 0 80 80">
            <circle className="cst-arc-bg" cx="40" cy="40" r="30" />
            <circle
              className="cst-arc-fill collect-arc"
              cx="40"
              cy="40"
              r="30"
              strokeDasharray={`${collectDash} ${circumference}`}
              strokeDashoffset="47.1"
            />
            <text x="40" y="37" className="cst-arc-pct">
              {collectionRate}%
            </text>
            <text x="40" y="50" className="cst-arc-lbl">
              Collection
            </text>
          </svg>
          <div className="cst-chart-sub">{formatCurrency(stats.ledgerDue)} due</div>
        </div>
      </div>
    </div>
  );
}
