import type { InvoiceLine } from '../../types';

export interface CompanyLetterhead {
  companyId: number;
  name: string;
  address?: string | null;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  url?: string | null;
}

export interface InvoicePrintContext {
  company: CompanyLetterhead;
  invoiceNo: string;
  salesOrderNo: string;
  billingByName?: string | null;
  verifiedByName?: string | null;
  collectedAmount: number;
}

export const REPORT_WARRANTY_NOTES = [
  'Warranty will be void if there any physical damage to the product or warranty sticker are removed and sold goods are not refundable.',
  "Keyboard, Mouse, Power Supply, Speaker, Remote, Adapter, Bluetooth, Toner, Any Kind Of Camera don't Carry any warranty.",
] as const;

export function filledPrintLines(lines: InvoiceLine[]) {
  return lines.filter((l) => l.rowStatus !== 'deleted' && l.productName.trim());
}

export function lineGross(line: InvoiceLine) {
  // Discount is per-unit; total deduct = unit discount * qty.
  return line.quantity * line.unitPrice - line.discount * line.quantity;
}

/** Sample PDF style: 1,300.00 */
export function formatPrintMoney(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Invoice date like sample: 03-Aug-2026 */
export function formatPrintDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-GB', { month: 'short' });
  return `${day}-${mon}-${d.getFullYear()}`;
}

export function formatPrintDateShort(d = new Date()) {
  return `${d.getDate()}-${d.toLocaleString('en-GB', { month: 'short' })}-${d.getFullYear()}`;
}

/** Sample: 5:10:36PM */
export function formatPrintTime(d = new Date()) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m}:${s}${ampm}`;
}

export function contactLine(company: CompanyLetterhead | null | undefined) {
  if (!company) return '';
  const bits = [
    `Phone : ${company.phone?.trim() || ''}`,
    `Fax : ${company.fax != null && String(company.fax).trim() !== '' ? company.fax : '0'}`,
    `E-mail : ${company.email?.trim() || ''}`,
    `Web : ${company.url?.trim() || ''}`,
  ];
  return bits.join(' ');
}

export function Kv({
  label,
  value,
  strong,
}: {
  label: string;
  value?: string | number | null;
  strong?: boolean;
}) {
  return (
    <div className="city-rpt-kv">
      <span className="k">{label}</span>
      <span className="s">:</span>
      <span className={strong ? 'v strong' : 'v'}>{value ?? ''}</span>
    </div>
  );
}
