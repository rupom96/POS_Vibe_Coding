import { MultiScanSearchInput } from '../MultiScanSearchInput';
import type { MultiScanSearchItem } from '../../types';

export function PosToolbar({
  sidebarOpen,
  companyId,
  locationId,
  readOnly = false,
  onToggleSidebar,
  onMultiScanPick,
  onOpenScanner,
  onHold,
  onListView,
}: {
  sidebarOpen: boolean;
  companyId: number;
  locationId: number;
  readOnly?: boolean;
  onToggleSidebar: () => void;
  onMultiScanPick: (item: MultiScanSearchItem) => void;
  onOpenScanner: () => void;
  onHold: () => void;
  onListView: () => void;
}) {
  return (
    <div className="pos-toolbar card">
      <div className="pos-toolbar-row">
        <button
          type="button"
          className={`tree-btn${sidebarOpen ? ' active' : ''}`}
          onClick={onToggleSidebar}
        >
          Tree View
        </button>

        <MultiScanSearchInput
          companyId={companyId}
          locationId={locationId}
          disabled={readOnly}
          onPick={onMultiScanPick}
          onOpenScanner={onOpenScanner}
        />

        <div className="pos-toolbar-actions">
          <div className="tip-w">
            <button type="button" className="icon-btn" onClick={onHold} disabled={readOnly}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            </button>
            <div className="tip">Hold Invoice (F9)</div>
          </div>
          <div className="tip-w">
            <button type="button" className="icon-btn" onClick={onListView}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
              </svg>
            </button>
            <div className="tip">Today&apos;s Invoice List</div>
          </div>
        </div>
      </div>
    </div>
  );
}
