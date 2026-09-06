export interface CreditNote {
  no: string;
  date: string;
  amt: number;
}

export interface InvoiceItemMeta {
  product: string;
  model: string;
  unit: string;
  sold: number;
  returned: number;
  price: number;
  disc: number;
  isSerial: boolean;
  serials?: string[];
  returnedSerials?: string[];
  creditNotes: CreditNote[];
}

export interface DemoInvoice {
  customer: string;
  phone: string;
  code: string;
  address: string;
  salesOrder: string;
  date: string;
  items: InvoiceItemMeta[];
}

export interface ReturnLine {
  id: string;
  product: string;
  model: string;
  invoice: string;
  location: string;
  unit: string;
  sold: number;
  returned: number;
  returnQty: number;
  price: number;
  disc: number;
  isSerial: boolean;
  serials: string[];
  returnedSerials: string[];
  selectedSerials: string[];
  creditNotes: CreditNote[];
}

export type HiddenColKey =
  | 'model'
  | 'invno'
  | 'loc'
  | 'unit'
  | 'sold'
  | 'returned'
  | 'dues'
  | 'rqty'
  | 'price'
  | 'total';

export const GRID_COLS: { key: HiddenColKey; label: string }[] = [
  { key: 'model', label: 'Model' },
  { key: 'invno', label: 'Invoice No' },
  { key: 'loc', label: 'Location' },
  { key: 'unit', label: 'Unit' },
  { key: 'sold', label: 'Sold Qty' },
  { key: 'returned', label: 'Returned' },
  { key: 'dues', label: 'Dues' },
  { key: 'rqty', label: 'Return Qty' },
  { key: 'price', label: 'Unit Price (Tk)' },
  { key: 'total', label: 'Return Amt (Tk)' },
];

export const LOCATIONS = ['Main Warehouse', 'Mirpur Branch', 'Gulshan Branch'] as const;

export const RETURN_NO = 'SR-FTLHO-2025-000024';
