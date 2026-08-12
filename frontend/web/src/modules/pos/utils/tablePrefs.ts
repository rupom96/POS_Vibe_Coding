import type { TablePrefs } from '../types';

export const DEFAULT_TABLE_PREFS: TablePrefs = {
  columnOrder: [
    'drag',
    'index',
    'productName',
    'modelNo',
    'stock',
    'unit',
    'quantity',
    'unitPrice',
    'discount',
    'warrantyDays',
    'vatPercent',
    'total',
    'actions',
  ],
  columnVisibility: {},
  columnPinning: { left: ['drag', 'index', 'productName'], right: ['total', 'actions'] },
  columnSizing: {},
  sorting: [],
  columnFilters: [],
  globalFilter: '',
  density: 'comfortable',
};

export function loadTablePrefs(): TablePrefs {
  try {
    const raw = localStorage.getItem('pos-items-table-prefs');
    if (!raw) return DEFAULT_TABLE_PREFS;
    return { ...DEFAULT_TABLE_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_TABLE_PREFS;
  }
}

export function saveTablePrefs(prefs: Partial<TablePrefs>) {
  try {
    const current = loadTablePrefs();
    localStorage.setItem('pos-items-table-prefs', JSON.stringify({ ...current, ...prefs }));
  } catch {
    /* ignore quota errors */
  }
}
