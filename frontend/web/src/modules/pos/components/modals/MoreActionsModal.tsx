export function MoreActionsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="mo active" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="md" style={{ width: 310 }}>
        <div className="mh">
          <span className="mhi">⋯</span>
          <span className="mt">More</span>
          <button type="button" className="mc" onClick={onClose}>✕</button>
        </div>

        <div className="mb" style={{ padding: '14px 16px' }}>
          <div style={{ marginBottom: 14 }}>
            <div className="more-section-title">Actions</div>
            <button type="button" className="more-action-btn">
              <span style={{ fontSize: 14 }}>📞</span>
              Create Service Call
            </button>
          </div>

          <div className="pos-modal-divider" style={{ marginBottom: 14 }} />

          <div>
            <div className="more-section-title">Reports</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="more-report-btn more-report-btn--blue">
                <span style={{ fontSize: 16 }}>📄</span>
                A5 Report
              </button>
              <button type="button" className="more-report-btn more-report-btn--purple">
                <span style={{ fontSize: 16 }}>🖨️</span>
                Pad Print
              </button>
            </div>
          </div>
        </div>

        <div className="mf">
          <button type="button" className="bs" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
