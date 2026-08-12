import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { calcLineTotal, formatNumber } from './format';
import type { InvoiceLine } from '../types';

export interface ExportRow {
  '#': number;
  Product: string;
  Model: string;
  Stock: string;
  Unit: string;
  Qty: number;
  'Unit Price': number;
  Discount: number;
  'Wty Days': number;
  'VAT %': number;
  Total: number;
  Status?: string;
}

function toExportRows(lines: InvoiceLine[]): ExportRow[] {
  return lines
    .filter((l) => l.rowStatus !== 'deleted')
    .map((line, index) => ({
      '#': index + 1,
      Product: line.productName,
      Model: line.modelNo,
      Stock: line.stock,
      Unit: line.unit,
      Qty: line.quantity,
      'Unit Price': line.unitPrice,
      Discount: line.discount,
      'Wty Days': line.warrantyDays,
      'VAT %': line.vatPercent,
      Total: calcLineTotal(line.quantity, line.unitPrice, line.discount, line.vatPercent, line.taxPercent),
      Status: line.rowStatus === 'new' ? 'New' : line.rowStatus === 'modified' ? 'Modified' : '',
    }));
}

export async function exportToExcel(lines: InvoiceLine[], filename = 'pos-items.xlsx') {
  const rows = toExportRows(lines);
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      const sheet = XLSX.utils.json_to_sheet(rows);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'Invoice Items');
      XLSX.writeFile(book, filename);
      resolve();
    }, 0);
  });
}

export async function exportToPdf(lines: InvoiceLine[], filename = 'pos-items.pdf') {
  const rows = toExportRows(lines);
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(12);
      doc.text('DataBiz POS — Invoice Items', 14, 14);
      autoTable(doc, {
        startY: 20,
        head: [['#', 'Product', 'Model', 'Qty', 'Price', 'Disc', 'VAT%', 'Total', 'Status']],
        body: rows.map((r) => [
          r['#'],
          r.Product,
          r.Model,
          r.Qty,
          formatNumber(r['Unit Price']),
          formatNumber(r.Discount),
          r['VAT %'],
          formatNumber(r.Total),
          r.Status ?? '',
        ]),
        styles: { fontSize: 8 },
      });
      doc.save(filename);
      resolve();
    }, 0);
  });
}
