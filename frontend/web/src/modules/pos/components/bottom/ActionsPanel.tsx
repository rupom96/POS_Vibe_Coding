import type { Ref } from 'react';

export function ActionsPanel({
  onSave,
  onInvoicePos,
  onHold,
  onClear,
  onReport,
  onChallan,
  onExchange,
  onMore,
  saving,
  saveDisabled = false,
  saveButtonRef,
}: {
  onSave: () => void;
  onInvoicePos: () => void;
  onHold: () => void;
  onClear: () => void;
  onReport: () => void;
  onChallan: () => void;
  onExchange: () => void;
  onMore: () => void;
  saving: boolean;
  /** True after a successful save until Clear All. */
  saveDisabled?: boolean;
  /** Real keyboard focus target for grid Enter → Save navigation. */
  saveButtonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <div className="bc">
      <div className="bch">Actions</div>
      <div className="ag">
        <button type="button" className="ab" onClick={onInvoicePos}>
          <span className="ai">🖨️</span>
          <span className="al">Invoice POS</span>
        </button>
        <button type="button" className="ab" onClick={onReport}>
          <span className="ai">📊</span>
          <span className="al">Report</span>
        </button>
        <button type="button" className="ab" onClick={onChallan}>
          <span className="ai">📄</span>
          <span className="al">Challan</span>
        </button>
        <button type="button" className="ab" onClick={onExchange}>
          <span className="ai">🔁</span>
          <span className="al">Exchange</span>
        </button>
        <button type="button" className="ab dng" onClick={onClear}>
          <span className="ai">🗑️</span>
          <span className="al">Clear All</span>
        </button>
        <button type="button" className="ab" onClick={onMore}>
          <span className="ai">⋯</span>
          <span className="al">More</span>
        </button>
        <button type="button" className="ab" onClick={onHold}>
          <span className="ai">⏸️</span>
          <span className="al">Hold</span>
        </button>
        <button
          ref={saveButtonRef}
          type="button"
          id="pos-save-btn"
          className="ab prim"
          style={{ gridColumn: '2 / 4' }}
          onClick={onSave}
          disabled={saving || saveDisabled}
        >
          <span className="ai">💾</span>
          <span className="al">{saving ? 'Saving...' : 'Save'}</span>
        </button>
      </div>
    </div>
  );
}
