import type { DemoInvoice } from './types';

export const invoiceDB: Record<string, DemoInvoice> = {
  'INV-FTLHO-2025-000349': {
    customer: 'Grameenphone Ltd',
    phone: '01711555888',
    code: 'CUS-FTLHO-2025-000024',
    address: 'GP House Bashundhara, Baridhara, Vatara, Dhaka; Khilkhet PS, Dhaka 1229',
    salesOrder: 'SO-FTLHO-2025-000359',
    date: '2025-07-05',
    items: [
      {
        product: 'Repairing service 5+ Years old 100AH battery',
        model: 'SVC-100AH',
        unit: 'Pcs',
        sold: 4,
        returned: 0,
        price: 17586,
        disc: 0,
        isSerial: false,
        creditNotes: [],
      },
      {
        product: 'UPS Battery 12V 100AH',
        model: 'UB-12100',
        unit: 'Pcs',
        sold: 6,
        returned: 2,
        price: 9500,
        disc: 100,
        isSerial: true,
        serials: ['GP12100-01', 'GP12100-02', 'GP12100-03', 'GP12100-04', 'GP12100-05', 'GP12100-06'],
        returnedSerials: ['GP12100-05', 'GP12100-06'],
        creditNotes: [{ no: 'CN-2025-0007', date: '2025-07-12', amt: 18800 }],
      },
      {
        product: 'Solar Panel 150W Mono',
        model: 'SP-150M',
        unit: 'Pcs',
        sold: 2,
        returned: 0,
        price: 12000,
        disc: 0,
        isSerial: false,
        creditNotes: [],
      },
    ],
  },
  'INV-FTLHO-2025-000341': {
    customer: 'Grameenphone Ltd',
    phone: '01711555888',
    code: 'CUS-FTLHO-2025-000024',
    address: 'GP House Bashundhara, Baridhara, Vatara, Dhaka; Khilkhet PS, Dhaka 1229',
    salesOrder: 'SO-FTLHO-2025-000341',
    date: '2025-06-20',
    items: [
      {
        product: 'Router Cisco RV340',
        model: 'RV340',
        unit: 'Pcs',
        sold: 3,
        returned: 0,
        price: 28500,
        disc: 500,
        isSerial: true,
        serials: ['CIS340-A1', 'CIS340-A2', 'CIS340-A3'],
        returnedSerials: [],
        creditNotes: [],
      },
      {
        product: 'CAT-6 Cable Box 305m',
        model: 'CAT6-305',
        unit: 'Box',
        sold: 10,
        returned: 1,
        price: 8200,
        disc: 0,
        isSerial: false,
        creditNotes: [{ no: 'CN-2025-0004', date: '2025-06-25', amt: 8200 }],
      },
    ],
  },
};

export const customerStatsDB: Record<
  string,
  { since: string; invoices: number; totalSales: number; totalReturn: number; returnRate: number }
> = {
  'Grameenphone Ltd': { since: '2019', invoices: 214, totalSales: 48200000, totalReturn: 640000, returnRate: 1.3 },
  'The Databiz Software Ltd.': { since: '2021', invoices: 87, totalSales: 8420000, totalReturn: 124000, returnRate: 3.2 },
  'Alpha Tech BD': { since: '2023', invoices: 14, totalSales: 580000, totalReturn: 38000, returnRate: 8.7 },
};

export const CUSTOMER_OPTIONS = Object.keys(customerStatsDB);
