import { useMemo, useRef } from 'react';
import { useAppSelector } from '../../../../app/hooks';
import { posSession } from '../../../../config/posSession';
import type { InvoiceLine } from '../../types';

function filledLines(lines: InvoiceLine[]) {
  return lines.filter((l) => l.rowStatus !== 'deleted' && l.productName.trim());
}

/** InvoiceNo with prefix before the first dash replaced by CHL (e.g. INV-… → CHL-…). */
function buildChallanNo(invoiceNo: string): string {
  const trimmed = invoiceNo.trim();
  if (!trimmed) return 'CHL';
  const dash = trimmed.indexOf('-');
  if (dash < 0) return `CHL-${trimmed}`;
  return `CHL${trimmed.slice(dash)}`;
}

const CHALLAN_PRINT_CSS = `
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #1e293b;
  }
  body {
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 10mm 8mm;
  }
  .challan-sheet {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: #1e293b;
    width: 100%;
    max-width: 180mm;
    margin: 0 auto;
    background: #fff;
  }
  @media print {
    @page { margin: 10mm 8mm; }
    html, body {
      min-height: 0;
      height: auto;
      display: block;
      padding: 0;
    }
    body {
      display: flex;
      justify-content: center;
      align-items: flex-start;
    }
    .challan-sheet {
      max-width: 180mm;
      margin: 0 auto;
    }
  }
`;

function printChallanSheet(source: HTMLElement | null, title: string): void {
  if (!source) return;
  const win = window.open('', '_blank', 'width=800,height=1000');
  if (!win) return;
  try {
    win.opener = null;
  } catch {
    /* ignore */
  }

  const safeTitle = title.replace(/</g, '');
  win.document.open();
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>${CHALLAN_PRINT_CSS}</style>
</head>
<body>
  <div class="challan-sheet">${source.innerHTML}</div>
</body>
</html>`);
  win.document.close();

  const runPrint = () => {
    try {
      win.focus();
      win.print();
    } finally {
      win.setTimeout(() => {
        try {
          win.close();
        } catch {
          /* ignore */
        }
      }, 400);
    }
  };

  if (win.document.readyState === 'complete') {
    win.setTimeout(runPrint, 80);
  } else {
    win.addEventListener('load', () => win.setTimeout(runPrint, 80));
  }
}

export function DeliveryChallanModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const form = useAppSelector((s) => s.pos);
  const sheetRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => filledLines(form.lines), [form.lines]);
  const totalQty = useMemo(() => rows.reduce((sum, line) => sum + line.quantity, 0), [rows]);

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-BD', { hour: '2-digit', minute: '2-digit' });
  const invoiceNo = form.invoiceNo.trim() || '—';
  const challanNo = buildChallanNo(form.invoiceNo.trim() || '');
  const companyName = posSession.companyName?.trim() || '—';

  if (!open) return null;

  const handlePrint = () => {
    printChallanSheet(sheetRef.current, `Delivery Challan ${challanNo}`);
  };

  return (
    <div className="mo active pos-doc-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="md pos-doc-shell" style={{ width: 520, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="mh pos-doc-mh-amber no-print">
          <span className="mhi">📦</span>
          <span className="mt" style={{ color: '#fff' }}>Delivery Challan</span>
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <button type="button" className="pos-doc-head-btn" onClick={handlePrint}>🖨 Print</button>
            <button type="button" className="mc pos-doc-head-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="mb pos-doc-body" style={{ padding: 0, overflowY: 'auto', flex: 1, background: '#f8fafc' }}>
          <div
            ref={sheetRef}
            style={{ fontFamily: "'Courier New', monospace", fontSize: 12, color: '#1e293b', padding: '20px 24px', background: '#fff' }}
          >
            <div style={{ textAlign: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '3px double #d97706' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#d97706', letterSpacing: 1 }}>{companyName}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', margin: '4px 0' }}>DELIVERY CHALLAN</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>Dhaka, Bangladesh</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Deliver To</div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{form.customerName || '—'}</div>
                <div style={{ fontSize: 11, color: '#475569' }}>📱 {form.mobile || '—'}</div>
                <div style={{ fontSize: 11, color: '#475569' }}>📍 {form.address || '—'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ marginBottom: 4 }}><span style={{ fontSize: 10, color: '#64748b' }}>Challan No: </span><span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#b45309' }}>{challanNo}</span></div>
                <div style={{ marginBottom: 4 }}><span style={{ fontSize: 10, color: '#64748b' }}>Invoice Ref: </span><span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{invoiceNo}</span></div>
                <div style={{ marginBottom: 4 }}><span style={{ fontSize: 10, color: '#64748b' }}>Date: </span><span style={{ fontWeight: 700 }}>{form.invoiceDate || '—'}</span></div>
                <div><span style={{ fontSize: 10, color: '#64748b' }}>Time: </span><span style={{ fontWeight: 700 }}>{timeStr}</span></div>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 16 }}>
              <thead>
                <tr style={{ background: '#fff8e1', borderBottom: '2px solid #fcd34d' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: 9.5, color: '#b45309', fontWeight: 800, width: 30 }}>#</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 9.5, color: '#b45309', fontWeight: 800 }}>Product / Description</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 9.5, color: '#b45309', fontWeight: 800, width: 50 }}>Qty</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: 9.5, color: '#b45309', fontWeight: 800, width: 50 }}>Unit</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: 9.5, color: '#b45309', fontWeight: 800, width: 70 }}>Warranty</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: 9.5, color: '#b45309', fontWeight: 800, width: 90 }}>Received ✓</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: 14 }}>No items</td></tr>
                ) : (
                  rows.map((line, index) => {
                    const serials = line.serials.map((s) => s.serialNo).filter(Boolean);
                    return (
                      <tr key={line.id}>
                        <td style={{ textAlign: 'center', padding: '6px 8px' }}>{index + 1}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>
                          {line.productName}
                          {line.modelNo ? (
                            <>
                              <br />
                              <span style={{ fontSize: 10, color: '#64748b', fontWeight: 400 }}>Model: {line.modelNo}</span>
                            </>
                          ) : null}
                          {serials.length > 0 ? (
                            <>
                              <br />
                              <span style={{ fontSize: 9.5, color: '#0369a1' }}>
                                {serials.slice(0, 5).join(', ')}
                                {serials.length > 5 ? ` +${serials.length - 5} more` : ''}
                              </span>
                            </>
                          ) : null}
                        </td>
                        <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700 }}>{line.quantity}</td>
                        <td style={{ textAlign: 'center', padding: '6px 8px' }}>{line.unit || 'Pcs'}</td>
                        <td style={{ textAlign: 'center', padding: '6px 8px' }}>{line.warrantyDays || '—'} days</td>
                        <td style={{ padding: '6px 8px' }}><div style={{ width: '100%', height: 20, borderBottom: '1px solid #94a3b8' }} /></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr style={{ background: '#fff8e1', borderTop: '2px solid #fcd34d' }}>
                  <td colSpan={2} style={{ padding: '7px 8px', fontWeight: 800, textAlign: 'right', fontSize: 12 }}>Total Quantity:</td>
                  <td style={{ padding: '7px 8px', fontWeight: 800, textAlign: 'right', fontSize: 13 }}>{totalQty}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginTop: 24, paddingTop: 16, borderTop: '1.5px dashed #cbd5e1' }}>
              {['Prepared By', 'Delivered By', 'Received By (Customer)'].map((label) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ height: 36, borderBottom: '1px solid #94a3b8', marginBottom: 6 }} />
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center', fontSize: 10, color: '#94a3b8', marginTop: 14, borderTop: '1.5px dashed #cbd5e1', paddingTop: 10 }}>
              Powered by DataBiz POS System • This is a delivery document — NOT a tax invoice
            </div>
          </div>
        </div>

        <div className="mf no-print">
          <button type="button" className="bs" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
