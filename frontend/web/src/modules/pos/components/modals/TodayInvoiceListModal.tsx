import { useGetTodayInvoicesQuery } from '../../api/posApi';
import type { TodayInvoiceListItem } from '../../types';
import { formatCurrency } from '../../utils/format';

export function TodayInvoiceListModal({
  open,
  onClose,
  companyId,
  locationId,
  employeeId,
  onOpenInvoice,
}: {
  open: boolean;
  onClose: () => void;
  companyId: number;
  locationId: number;
  employeeId: number;
  onOpenInvoice: (invoiceNo: string) => void | Promise<void>;
}) {
  const { data: invoices = [], isLoading, isFetching, refetch } = useGetTodayInvoicesQuery(
    { companyId, locationId, employeeId, limit: 100 },
    { skip: !open },
  );

  if (!open) return null;

  const handleOpen = async (invoiceNo: string) => {
    await onOpenInvoice(invoiceNo);
    onClose();
  };

  return (
    <div className="mo active" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="md wide">
        <div className="mh">
          <span className="mhi">📋</span>
          <span className="mt">Today&apos;s Invoice List</span>
          <button type="button" className="mc" onClick={onClose}>✕</button>
        </div>
        <div className="mb" style={{ padding: 0 }}>
          <table className="stbl">
            <thead>
              <tr>
                <th>Invoice No</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Grand Total</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {isLoading || isFetching ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--text3)' }}>
                    Loading…
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--text3)' }}>
                    No invoices for today
                  </td>
                </tr>
              ) : (
                invoices.map((inv: TodayInvoiceListItem) => (
                  <tr key={inv.salesOrderId}>
                    <td><span className="stag">{inv.invoiceNo}</span></td>
                    <td>{inv.customerName || '—'}</td>
                    <td>{inv.itemCount}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{formatCurrency(inv.grandTotal)}</td>
                    <td>
                      <span className={`bdg ${inv.status === 'Active' ? 'bdg-g' : 'bdg-b'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="hr-btn" onClick={() => void handleOpen(inv.invoiceNo)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mf">
          <button type="button" className="bs" onClick={() => void refetch()}>Refresh</button>
          <button type="button" className="bs" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
