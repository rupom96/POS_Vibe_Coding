import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../../shared/components/Toast';
import { generateId } from '../../../shared/utils/generateId';
import { CUSTOMER_OPTIONS, invoiceDB } from '../demoData';
import {
  GRID_COLS,
  LOCATIONS,
  RETURN_NO,
  type HiddenColKey,
  type InvoiceItemMeta,
  type ReturnLine,
} from '../types';
import '../styles/salesReturn.css';

const HIDDEN_COLS_KEY = 'salesReturnHiddenCols';
const PREVIOUS = '__PREVIOUS__';

function fmt(n: number) {
  return n.toLocaleString('en-BD', { maximumFractionDigits: 2 });
}

function localDateTimeValue(d = new Date()) {
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dateValue(d: Date) {
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function emptyLine(location: string): ReturnLine {
  return {
    id: generateId(),
    product: '',
    model: '',
    invoice: '',
    location,
    unit: 'Pcs',
    sold: 0,
    returned: 0,
    returnQty: 0,
    price: 0,
    disc: 0,
    isSerial: false,
    serials: [],
    returnedSerials: [],
    selectedSerials: [],
    creditNotes: [],
  };
}

function lineFromItem(invoiceNo: string, it: InvoiceItemMeta, location: string, fullReturn: boolean): ReturnLine {
  const dues = Math.max(0, it.sold - it.returned);
  const returnableSerials = (it.serials || []).filter((s) => !(it.returnedSerials || []).includes(s));
  return {
    id: generateId(),
    product: it.product,
    model: it.model,
    invoice: invoiceNo,
    location,
    unit: it.unit,
    sold: it.sold,
    returned: it.returned,
    returnQty: fullReturn ? dues : 0,
    price: it.price,
    disc: it.disc,
    isSerial: it.isSerial,
    serials: it.serials || [],
    returnedSerials: it.returnedSerials || [],
    selectedSerials: fullReturn && it.isSerial ? returnableSerials : [],
    creditNotes: it.creditNotes || [],
  };
}

function loadHiddenCols(): Set<HiddenColKey> {
  try {
    const saved = JSON.parse(localStorage.getItem(HIDDEN_COLS_KEY) || '[]') as string[];
    return new Set(saved.filter((k): k is HiddenColKey => GRID_COLS.some((c) => c.key === k)));
  } catch {
    return new Set();
  }
}

type ModalId = 'serial' | 'invoice' | 'qr' | 'more' | null;

export function SalesReturnPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const colPickRef = useRef<HTMLDivElement>(null);
  const serialScanRef = useRef<HTMLInputElement>(null);

  const now = useMemo(() => new Date(), []);
  const yearAgo = useMemo(() => new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()), [now]);

  const [retCollapsed, setRetCollapsed] = useState(true);
  const [project, setProject] = useState('GP Network Expansion');
  const [returnDate, setReturnDate] = useState(localDateTimeValue(now));
  const [returnType, setReturnType] = useState('Regular');
  const [returnReason, setReturnReason] = useState('');
  const [reasonDetails, setReasonDetails] = useState('');
  const [customer, setCustomer] = useState('Grameenphone Ltd');
  const [custCode, setCustCode] = useState('CUS-FTLHO-2025-000024');
  const [custPhone, setCustPhone] = useState('01711555888');
  const [custAddress, setCustAddress] = useState(
    'GP House Bashundhara, Baridhara, Vatara, Dhaka; Khilkhet PS, Dhaka 1229',
  );
  const [dateFrom, setDateFrom] = useState(dateValue(yearAgo));
  const [dateTo, setDateTo] = useState(dateValue(now));
  const [salesOrder, setSalesOrder] = useState('SO-FTLHO-2025-000359');
  const [invoiceNo, setInvoiceNo] = useState('INV-FTLHO-2025-000349');
  const [location, setLocation] = useState<string>(LOCATIONS[0]);
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [multiScan, setMultiScan] = useState('');
  const [hiddenCols, setHiddenCols] = useState<Set<HiddenColKey>>(loadHiddenCols);
  const [colPickOpen, setColPickOpen] = useState(false);
  const [modal, setModal] = useState<ModalId>(null);
  const [serialDraft, setSerialDraft] = useState<Set<string>>(new Set());
  const [serialScan, setSerialScan] = useState('');
  const [qrManual, setQrManual] = useState('');
  const [clock, setClock] = useState('');
  const [initialized, setInitialized] = useState(false);

  const activeLine = lines.find((l) => l.id === activeLineId) ?? null;

  const invoiceKeys = useMemo(() => {
    if (invoiceNo === PREVIOUS) return Object.keys(invoiceDB);
    return invoiceDB[invoiceNo] ? [invoiceNo] : [];
  }, [invoiceNo]);

  const productOptions = useMemo(() => {
    const set = new Set<string>();
    invoiceKeys.forEach((k) => invoiceDB[k].items.forEach((i) => set.add(i.product)));
    return [...set];
  }, [invoiceKeys]);

  const totals = useMemo(() => {
    let products = 0;
    let qty = 0;
    let gross = 0;
    let discTotal = 0;
    for (const line of lines) {
      if (line.returnQty <= 0) continue;
      products += 1;
      qty += line.returnQty;
      gross += line.price * line.returnQty;
      discTotal += line.disc * line.returnQty;
    }
    return { products, qty, gross, discTotal, net: gross - discTotal };
  }, [lines]);

  const itemCount = lines.filter((l) => l.product.trim()).length;

  const loadInvoice = useCallback(
    (inv: string, fullReturn: boolean) => {
      const keys = inv === PREVIOUS ? Object.keys(invoiceDB) : invoiceDB[inv] ? [inv] : [];
      if (!keys.length) {
        showToast('Invoice not found', '⚠️');
        return;
      }
      const primary = invoiceDB[keys[0]];
      setCustomer(primary.customer);
      setCustPhone(primary.phone);
      setCustCode(primary.code);
      setCustAddress(primary.address);
      if (inv !== PREVIOUS) setSalesOrder(primary.salesOrder);

      const next: ReturnLine[] = [];
      keys.forEach((k) => {
        invoiceDB[k].items.forEach((it) => {
          next.push(lineFromItem(k, it, location, fullReturn));
        });
      });
      setLines(next);
      setActiveLineId(next[0]?.id ?? null);
      const label =
        inv === PREVIOUS
          ? 'Previous invoices loaded — '
          : fullReturn
            ? 'Full return loaded — '
            : 'Invoice loaded — ';
      showToast(`${label}${next.length} items`, '🧾');
    },
    [location, showToast],
  );

  useEffect(() => {
    if (initialized) return;
    setInitialized(true);
    loadInvoice('INV-FTLHO-2025-000349', false);
  }, [initialized, loadInvoice]);

  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setClock(
        `${n.toLocaleDateString('en-GB')}  ${n.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}`,
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (colPickRef.current && !colPickRef.current.contains(e.target as Node)) {
        setColPickOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModal(null);
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveReturn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- saveReturn closes over latest state
  });

  useEffect(() => {
    if (modal === 'serial') {
      window.setTimeout(() => serialScanRef.current?.focus(), 150);
    }
  }, [modal]);

  const updateLine = (id: string, patch: Partial<ReturnLine>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        const dues = Math.max(0, next.sold - next.returned);
        if (next.sold > 0 && next.returnQty > dues) {
          next.returnQty = dues;
          showToast(`Return Qty cannot exceed Dues (${dues})`, '⚠️');
        }
        return next;
      }),
    );
  };

  const findProductMeta = (name: string): (InvoiceItemMeta & { invoice: string }) | null => {
    for (const inv of invoiceKeys) {
      const it = invoiceDB[inv].items.find((i) => i.product.toLowerCase() === name.toLowerCase());
      if (it) return { ...it, invoice: inv };
    }
    return null;
  };

  const onProductChange = (id: string, name: string) => {
    const meta = findProductMeta(name.trim());
    if (meta) {
      updateLine(id, {
        product: meta.product,
        model: meta.model,
        invoice: meta.invoice,
        unit: meta.unit,
        sold: meta.sold,
        returned: meta.returned,
        price: meta.price,
        disc: meta.disc,
        isSerial: meta.isSerial,
        serials: meta.serials || [],
        returnedSerials: meta.returnedSerials || [],
        selectedSerials: [],
        creditNotes: meta.creditNotes || [],
        returnQty: 0,
      });
    } else {
      updateLine(id, { product: name });
    }
  };

  const clearGrid = () => {
    if (lines.some((l) => l.product.trim()) && !window.confirm('Clear all return items?')) return;
    const blank = emptyLine(location);
    setLines([blank]);
    setActiveLineId(blank.id);
    showToast('Grid cleared ✓', '🗑️');
  };

  const deleteLine = (id: string) => {
    setLines((prev) => {
      const next = prev.filter((l) => l.id !== id);
      if (!next.length) {
        const blank = emptyLine(location);
        setActiveLineId(blank.id);
        return [blank];
      }
      if (activeLineId === id) setActiveLineId(next[0]?.id ?? null);
      return next;
    });
    showToast('Item removed');
  };

  const onInvoiceSelect = (value: string) => {
    setInvoiceNo(value);
    loadInvoice(value, false);
  };

  const onSalesOrderChange = (so: string) => {
    setSalesOrder(so);
    const inv = Object.keys(invoiceDB).find((k) => invoiceDB[k].salesOrder === so);
    if (inv) {
      setInvoiceNo(inv);
      loadInvoice(inv, false);
    }
  };

  const fullReturn = () => {
    setReturnType('Full Return');
    loadInvoice(invoiceNo, true);
  };

  const applyMultiScan = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    const byInv = Object.keys(invoiceDB).find((k) => k.toLowerCase() === v.toLowerCase());
    if (byInv) {
      setInvoiceNo(byInv);
      loadInvoice(byInv, false);
      setMultiScan('');
      return;
    }
    const bySo = Object.keys(invoiceDB).find((k) => invoiceDB[k].salesOrder.toLowerCase() === v.toLowerCase());
    if (bySo) {
      setInvoiceNo(bySo);
      loadInvoice(bySo, false);
      setMultiScan('');
      return;
    }
    showToast(`No match for: ${v}`, '⚠️');
  };

  const openSerialModal = (line: ReturnLine) => {
    if (!line.serials.length) {
      showToast('No serials on this product', '⚠️');
      return;
    }
    setActiveLineId(line.id);
    setSerialDraft(new Set(line.selectedSerials));
    setSerialScan('');
    setModal('serial');
  };

  const confirmSerials = () => {
    if (!activeLineId) {
      setModal(null);
      return;
    }
    const selected = [...serialDraft];
    updateLine(activeLineId, { selectedSerials: selected, returnQty: selected.length });
    setModal(null);
    showToast(`Serials confirmed ✓ (${selected.length} units)`, '🔢');
  };

  const toggleGridCol = (key: HiddenColKey, visible: boolean) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(key);
      else next.add(key);
      localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const saveReturn = () => {
    const rows = lines.filter((l) => l.returnQty > 0);
    if (!rows.length) {
      showToast('Add at least one item with Return Qty', '⚠️');
      return;
    }
    if (!returnReason) {
      showToast('Please select a Return Reason', '⚠️');
      return;
    }
    showToast(`Sales Return saved ✓ (${rows.length} items)`, '💾');
  };

  const closePage = () => {
    if (window.confirm('Close this Sales Return? Unsaved data will be lost.')) {
      navigate('/');
    }
  };

  const hideAttr = [...hiddenCols].join(' ');
  const duesOf = (l: ReturnLine) => Math.max(0, l.sold - l.returned);
  const lineAmt = (l: ReturnLine) => Math.max(0, (l.price - l.disc) * l.returnQty);

  const psh = activeLine
    ? {
        prod: activeLine.product || '— select a row —',
        unit: activeLine.unit || '—',
        price: activeLine.price ? fmt(activeLine.price) : '—',
        qty: activeLine.sold || '—',
        disc: fmt(activeLine.disc),
        total: activeLine.sold ? fmt((activeLine.price - activeLine.disc) * activeLine.sold) : '—',
        returned: String(activeLine.returned || 0),
        dues: String(duesOf(activeLine) || 0),
        now: String(activeLine.returnQty || 0),
        creditNotes: activeLine.creditNotes,
      }
    : null;

  return (
    <div className="sr-shell">
      <div className="sr-page-intro">
        <h1 className="sr-page-title">Sales Return</h1>
        <p className="sr-page-sub">Return against invoice · edit Return Qty · Alt+S to save</p>
      </div>

      <div className="sr-toolbar">
        <div className="ms-wrap">
          <span className="ms-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <input
            className="ms-input"
            value={multiScan}
            onChange={(e) => setMultiScan(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyMultiScan(multiScan);
            }}
            placeholder="Multi Scan — Invoice No, Sales Order, Customer, Code, Serial, Barcode…"
            autoComplete="off"
          />
          <div className="tip-w">
            <button type="button" className="qr-btn" onClick={() => setModal('qr')} title="QR / Barcode Scan">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
            <div className="tip">QR / Barcode Scan</div>
          </div>
        </div>
        <select className="fv" style={{ maxWidth: 180 }} value={location} onChange={(e) => setLocation(e.target.value)}>
          {LOCATIONS.map((loc) => (
            <option key={loc} value={loc}>
              📍 {loc}
            </option>
          ))}
        </select>
      </div>

      <div className="body-wrap">
        <div className={`content${retCollapsed ? ' ret-collapsed' : ''}`}>
          <div className="top-row">
            <div className={`card ret-card${retCollapsed ? ' collapsed' : ''}`}>
              <button
                type="button"
                className="ret-toggle"
                title={retCollapsed ? 'Show Return Details & Sales History' : 'Hide Return Details & Sales History'}
                aria-label="Toggle Return Details"
                onClick={() => setRetCollapsed((v) => !v)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  {retCollapsed ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />}
                </svg>
              </button>
              <div className="ret-inner">
                <div className="ch">
                  <span className="dot" />
                  Return Details
                </div>
                <div className="cb">
                  <div className="fr">
                    <span className="fl">Project</span>
                    <select className="fv" value={project} onChange={(e) => setProject(e.target.value)}>
                      <option value="">---Select---</option>
                      <option>GP Network Expansion</option>
                      <option>Corporate Supply</option>
                      <option>Retail</option>
                    </select>
                  </div>
                  <div className="fr">
                    <span className="fl">
                      Return Date<span className="req">*</span>
                    </span>
                    <input className="fv mono" type="datetime-local" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
                  </div>
                  <div className="fr" style={{ gap: 5 }}>
                    <span className="fl">
                      Return Type<span className="req">*</span>
                    </span>
                    <select className="fv" style={{ flex: 1, minWidth: 0 }} value={returnType} onChange={(e) => setReturnType(e.target.value)}>
                      <option>Regular</option>
                      <option>Full Return</option>
                      <option>Partial</option>
                      <option>Exchange</option>
                      <option>Damaged</option>
                    </select>
                    <span className="fl" style={{ width: 'auto', flexShrink: 0 }}>
                      Reason
                    </span>
                    <select className="fv" style={{ flex: 1, minWidth: 0 }} value={returnReason} onChange={(e) => setReturnReason(e.target.value)}>
                      <option value="">---Select---</option>
                      <option>Defective / Faulty</option>
                      <option>Wrong Item Delivered</option>
                      <option>Warranty Claim</option>
                      <option>Customer Changed Mind</option>
                      <option>Excess Delivery</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div className="fr">
                    <span className="fl">Reason Details</span>
                    <input
                      className="fv"
                      value={reasonDetails}
                      onChange={(e) => setReasonDetails(e.target.value)}
                      placeholder="Optional note about the return…"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="ch">
                <span className="dot" style={{ background: 'var(--blue)' }} />
                Customer Information
              </div>
              <div className="cb">
                <div className="fr">
                  <span className="fl">
                    Customer<span className="req">*</span>
                  </span>
                  <input
                    className="fv"
                    list="sr-custs"
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value)}
                  />
                  <datalist id="sr-custs">
                    {CUSTOMER_OPTIONS.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div className="fr">
                  <span className="fl">Code</span>
                  <input className="fv mono" value={custCode} onChange={(e) => setCustCode(e.target.value)} />
                </div>
                <div className="fr">
                  <span className="fl">Phone No</span>
                  <input className="fv mono" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />
                </div>
                <div className="fr">
                  <span className="fl">Address</span>
                  <input className="fv" value={custAddress} readOnly />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="ch">
                <span className="dot" style={{ background: 'var(--orange)' }} />
                Source / Reference
              </div>
              <div className="cb">
                <div className="fr">
                  <span className="fl">Return No</span>
                  <input className="fv mono acc" value={RETURN_NO} readOnly />
                </div>
                <div className="fr" style={{ gap: 5 }}>
                  <span className="fl">Date Range</span>
                  <input className="fv mono" type="date" style={{ flex: 1, minWidth: 0 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  <span className="fl" style={{ width: 'auto', flexShrink: 0 }}>
                    To
                  </span>
                  <input className="fv mono" type="date" style={{ flex: 1, minWidth: 0 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => {
                      showToast('Invoices loaded for date range', '📅');
                      setModal('invoice');
                    }}
                  >
                    Load
                  </button>
                </div>
                <div className="fr">
                  <span className="fl">Sales Order</span>
                  <select className="fv" value={salesOrder} onChange={(e) => onSalesOrderChange(e.target.value)}>
                    <option>SO-FTLHO-2025-000359</option>
                    <option>SO-FTLHO-2025-000341</option>
                  </select>
                </div>
                <div className="fr" style={{ gap: 5 }}>
                  <span className="fl">
                    Invoice No<span className="req">*</span>
                  </span>
                  <select className="fv mono" style={{ flex: 1, minWidth: 0 }} value={invoiceNo} onChange={(e) => onInvoiceSelect(e.target.value)}>
                    <option>INV-FTLHO-2025-000349</option>
                    <option>INV-FTLHO-2025-000341</option>
                    <option value={PREVIOUS}>Previous Invoice</option>
                  </select>
                  <button type="button" className="mini-btn blue" onClick={fullReturn} title="Return full invoice quantities">
                    Full Return
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="ugrid" data-hide={hideAttr}>
            <div className="ug-header">
              <span className="ug-dot" />
              Return Items
              <span className="ug-hint">
                · Select invoice → items auto-load · edit{' '}
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Return Qty</span> · Return Qty ≤ Dues · Serial
                products → pick serials · <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Alt+S</span> = Save
              </span>
              <span className="ug-count">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </span>
              <div className="col-pick-wrap" ref={colPickRef}>
                <button
                  type="button"
                  className="btn-ghost col-pick-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setColPickOpen((v) => !v);
                  }}
                >
                  Columns
                </button>
                <div className={`col-pick-menu${colPickOpen ? ' open' : ''}`}>
                  <div className="col-pick-title">Show / Hide Columns</div>
                  <div className="col-pick-list">
                    {GRID_COLS.map((c) => (
                      <label key={c.key} className="col-pick-item">
                        <input
                          type="checkbox"
                          checked={!hiddenCols.has(c.key)}
                          onChange={(e) => toggleGridCol(c.key, e.target.checked)}
                        />
                        <span>{c.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <button type="button" className="btn-ghost" style={{ padding: '2px 9px', fontSize: 10.5, borderRadius: 5 }} onClick={clearGrid}>
                Clear All
              </button>
            </div>
            <div className="ug-scroll">
              <table className="ug-tbl">
                <thead>
                  <tr>
                    <th className="ug-th ug-col-sl" style={{ width: 30 }}>
                      #
                    </th>
                    <th className="ug-th ug-col-prod" style={{ minWidth: 230 }}>
                      Product / Barcode
                    </th>
                    <th className="ug-th ug-col-model" style={{ minWidth: 90 }}>
                      Model
                    </th>
                    <th className="ug-th ug-col-invno" style={{ minWidth: 190 }}>
                      Invoice No
                    </th>
                    <th className="ug-th ug-col-loc" style={{ minWidth: 140 }}>
                      Location
                    </th>
                    <th className="ug-th ug-col-unit" style={{ minWidth: 62 }}>
                      Unit
                    </th>
                    <th className="ug-th ug-col-sold" style={{ minWidth: 64 }}>
                      Sold Qty
                    </th>
                    <th className="ug-th ug-col-returned" style={{ minWidth: 70 }}>
                      Returned
                    </th>
                    <th className="ug-th ug-col-dues" style={{ minWidth: 64 }}>
                      Dues
                    </th>
                    <th className="ug-th ug-col-rqty" style={{ minWidth: 76 }}>
                      Return Qty
                    </th>
                    <th className="ug-th ug-col-price" style={{ minWidth: 96 }}>
                      Unit Price (Tk)
                    </th>
                    <th className="ug-th ug-col-total" style={{ minWidth: 110 }}>
                      Return Amt (Tk)
                    </th>
                    <th className="ug-th ug-col-act" style={{ width: 34 }} />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => {
                    const dues = duesOf(line);
                    const amt = lineAmt(line);
                    return (
                      <tr
                        key={line.id}
                        className={`ug-tr${activeLineId === line.id ? ' active-row' : ''}`}
                        onFocusCapture={() => setActiveLineId(line.id)}
                        onClick={() => setActiveLineId(line.id)}
                      >
                        <td className="ug-td ug-td-sl ug-col-sl">{idx + 1}</td>
                        <td className="ug-td ug-td-prod ug-col-prod">
                          <div className="ug-prod-wrap">
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <input
                                className="ug-inp ug-prod-inp"
                                list="sr-prodList"
                                placeholder="Search / scan product…"
                                value={line.product}
                                style={{ flex: 1 }}
                                onChange={(e) => onProductChange(line.id, e.target.value)}
                              />
                              {line.isSerial ? (
                                <span style={{ paddingRight: 6, flexShrink: 0 }}>
                                  <button type="button" className="serial-badge" onClick={() => openSerialModal(line)}>
                                    🔢 Serials
                                  </button>
                                </span>
                              ) : null}
                            </div>
                            {line.selectedSerials.length ? (
                              <div className="ug-serial-area">
                                {line.selectedSerials.map((s) => (
                                  <span key={s} className="ug-stag">
                                    {s}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="ug-td ug-col-model">
                          <input className="ug-inp" placeholder="Model" value={line.model} onChange={(e) => updateLine(line.id, { model: e.target.value })} />
                        </td>
                        <td className="ug-td ug-col-invno">
                          <input className="ug-inp ug-mono" value={line.invoice} placeholder="—" onChange={(e) => updateLine(line.id, { invoice: e.target.value })} />
                        </td>
                        <td className="ug-td ug-col-loc">
                          <select className="ug-inp" value={line.location} onChange={(e) => updateLine(line.id, { location: e.target.value })}>
                            {LOCATIONS.map((loc) => (
                              <option key={loc} value={loc}>
                                {loc}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="ug-td ug-col-unit">
                          <input className="ug-inp" value={line.unit} readOnly tabIndex={-1} style={{ color: 'var(--text3)' }} />
                        </td>
                        <td className="ug-td ug-col-sold">
                          <span className="ug-cell ug-sold">{line.sold || '—'}</span>
                        </td>
                        <td className="ug-td ug-col-returned">
                          <span className="ug-cell ug-returned">{line.returned || '—'}</span>
                        </td>
                        <td className="ug-td ug-col-dues">
                          <span className="ug-cell ug-dues">{dues || '—'}</span>
                        </td>
                        <td className="ug-td ug-col-rqty">
                          <input
                            className="ug-inp ug-mono ug-rqty"
                            type="number"
                            min={0}
                            value={line.returnQty || ''}
                            placeholder="0"
                            onChange={(e) => updateLine(line.id, { returnQty: parseFloat(e.target.value) || 0 })}
                          />
                        </td>
                        <td className="ug-td ug-col-price">
                          <input
                            className="ug-inp ug-mono"
                            type="number"
                            value={line.price || ''}
                            placeholder="0"
                            onChange={(e) => updateLine(line.id, { price: parseFloat(e.target.value) || 0 })}
                          />
                        </td>
                        <td className="ug-td ug-col-total">
                          <span className={`ug-total${amt ? '' : ' empty'}`}>{amt ? fmt(amt) : '—'}</span>
                        </td>
                        <td className="ug-td ug-td-del ug-col-act">
                          <button type="button" className="del-btn" onClick={() => deleteLine(line.id)}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <datalist id="sr-prodList">
                {productOptions.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="bot">
            <div className="bc bc-actions">
              <div className="bch">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
                  <polyline points="13 2 13 9 20 9" />
                </svg>
                Actions
              </div>
              <div className="ag">
                <button type="button" className="ab" onClick={() => showToast('Report generating…', '📊')}>
                  <span className="ai">📊</span>
                  <span className="al">Report</span>
                </button>
                <button type="button" className="ab dng" onClick={clearGrid}>
                  <span className="ai">🗑️</span>
                  <span className="al">Clear</span>
                </button>
                <button type="button" className="ab" onClick={() => setModal('more')}>
                  <span className="ai">⋯</span>
                  <span className="al">More</span>
                </button>
                <button type="button" className="ab dng" onClick={closePage}>
                  <span className="ai">✖️</span>
                  <span className="al">Close</span>
                </button>
                <button type="button" className="ab prim" style={{ gridColumn: '2 / 4' }} onClick={saveReturn}>
                  <span className="ai">💾</span>
                  <span className="al">Save</span>
                </button>
              </div>
            </div>

            <div className="bc bc-psh">
              <div className="bch">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ flexShrink: 0 }}>
                  <path d="M3 3v18h18" />
                  <path d="M7 14l4-4 3 3 5-6" />
                </svg>
                <span style={{ flexShrink: 0 }}>Product Sales History</span>
                <span className="psh-prod" title={psh?.prod || ''}>
                  {psh?.prod || '— select a row —'}
                </span>
              </div>
              <div className="psh-body">
                <div className="psh-grid">
                  <div className="psh-row">
                    <span className="psh-l">Unit Type</span>
                    <input className="psh-v" value={psh?.unit || '—'} readOnly />
                  </div>
                  <div className="psh-row">
                    <span className="psh-l">Price/Qty</span>
                    <input className="psh-v" value={psh?.price || '—'} readOnly />
                  </div>
                  <div className="psh-row">
                    <span className="psh-l">Quantity</span>
                    <input className="psh-v" value={String(psh?.qty ?? '—')} readOnly />
                  </div>
                  <div className="psh-row">
                    <span className="psh-l">Discount</span>
                    <input className="psh-v" value={psh?.disc || '—'} readOnly />
                  </div>
                  <div className="psh-row">
                    <span className="psh-l">Total Price</span>
                    <input className="psh-v acc" value={psh?.total || '—'} readOnly />
                  </div>
                  <div className="psh-row">
                    <span className="psh-l">Returned</span>
                    <input className="psh-v org" value={psh?.returned || '—'} readOnly />
                  </div>
                  <div className="psh-row">
                    <span className="psh-l">Dues</span>
                    <input className="psh-v blue" value={psh?.dues || '—'} readOnly />
                  </div>
                  <div className="psh-row">
                    <span className="psh-l">Now Ret.</span>
                    <input className="psh-v acc" value={psh?.now || '—'} readOnly />
                  </div>
                </div>
                <div className="psh-cn">
                  <div className="psh-cn-title">Credit Notes</div>
                  <div className="psh-cn-scroll">
                    <table className="cn-tbl">
                      <thead>
                        <tr>
                          <th>Credit Note No</th>
                          <th>Date</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {psh?.creditNotes?.length ? (
                          psh.creditNotes.map((c) => (
                            <tr key={c.no}>
                              <td style={{ color: 'var(--accent)' }}>{c.no}</td>
                              <td>{c.date}</td>
                              <td>৳ {fmt(c.amt)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3} className="cn-empty">
                              No credit note issued yet
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <div className="bc">
              <div className="bch">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M9 14l2 2 4-4" />
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                </svg>
                Total Return
              </div>
              <div className="bcb">
                <div className="tl">
                  <span className="tl-l">No. of Products</span>
                  <span className="tl-v">{totals.products}</span>
                </div>
                <div className="tl">
                  <span className="tl-l">Total Return Qty</span>
                  <span className="tl-v">{totals.qty} Pcs</span>
                </div>
                <div className="tl">
                  <span className="tl-l">Gross Amount</span>
                  <span className="tl-v">৳ {fmt(totals.gross)}</span>
                </div>
                <div className="tl">
                  <span className="tl-l">Discount</span>
                  <span className="tl-v org">— {fmt(totals.discTotal)}</span>
                </div>
                <div className="tl grand">
                  <span className="tl-l" style={{ fontWeight: 700, color: 'var(--text)' }}>
                    Net Refund
                  </span>
                  <span className="tl-v acc">৳ {fmt(totals.net)}</span>
                </div>
              </div>
              <div className="pay-wrap" style={{ paddingTop: 0 }}>
                <div className="pay-row">
                  <div className="pay-big chg">
                    <div className="pay-label">Refund Amount (Tk)</div>
                    <span className="pay-big-val chg">{fmt(totals.net)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="sbar">
        <span>
          <span className="sd" />
          Connected
        </span>
        <span>{RETURN_NO}</span>
        <span>{customer || '—'}</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)' }}>{clock}</span>
      </div>

      {/* Serial modal */}
      <div className={`mo${modal === 'serial' ? ' active' : ''}`} onClick={(e) => e.target === e.currentTarget && setModal(null)}>
        <div className="md wide">
          <div className="mh">
            <span className="mhi">🔢</span>
            <span className="mt">Select Serials — {activeLine?.product || ''}</span>
            <button type="button" className="mc" onClick={() => setModal(null)}>
              ✕
            </button>
          </div>
          <div className="mb">
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
              Tick the serials being returned. Selected count auto-fills the Return Qty.
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <input
                ref={serialScanRef}
                className="mfi"
                value={serialScan}
                onChange={(e) => setSerialScan(e.target.value)}
                placeholder="Scan a serial to tick it…"
                style={{ flex: 1 }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  const v = serialScan.trim();
                  if (!v || !activeLine) return;
                  const match = activeLine.serials.find((s) => s.toLowerCase() === v.toLowerCase());
                  if (match && !activeLine.returnedSerials.includes(match)) {
                    setSerialDraft((prev) => new Set(prev).add(match));
                    showToast(`Serial ticked: ${match}`, '🔢');
                  } else {
                    showToast('Serial not found / already returned', '🔢');
                  }
                  setSerialScan('');
                }}
              />
              <button
                type="button"
                className="bp"
                style={{ padding: '0 12px', fontSize: 12 }}
                onClick={() => {
                  const v = serialScan.trim();
                  if (!v || !activeLine) return;
                  const match = activeLine.serials.find((s) => s.toLowerCase() === v.toLowerCase());
                  if (match && !activeLine.returnedSerials.includes(match)) {
                    setSerialDraft((prev) => new Set(prev).add(match));
                    showToast(`Serial ticked: ${match}`, '🔢');
                  } else {
                    showToast('Serial not found / already returned', '🔢');
                  }
                  setSerialScan('');
                }}
              >
                Tick
              </button>
              <button
                type="button"
                className="bs"
                style={{ padding: '0 12px', fontSize: 12 }}
                onClick={() => {
                  if (!activeLine) return;
                  const returnable = activeLine.serials.filter((s) => !activeLine.returnedSerials.includes(s));
                  const allOn = returnable.every((s) => serialDraft.has(s));
                  setSerialDraft(allOn ? new Set() : new Set(returnable));
                }}
              >
                Toggle All
              </button>
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', maxHeight: 230, overflowY: 'auto' }}>
              <table className="stbl">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>Ret</th>
                    <th style={{ width: 40 }}>#</th>
                    <th>Serial No</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeLine?.serials || []).map((s, i) => {
                    const done = activeLine?.returnedSerials.includes(s);
                    return (
                      <tr key={s}>
                        <td>
                          <input
                            type="checkbox"
                            className="rsel"
                            disabled={done}
                            checked={serialDraft.has(s)}
                            onChange={(e) => {
                              setSerialDraft((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(s);
                                else next.delete(s);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td>{i + 1}</td>
                        <td>
                          <span className="stag">{s}</span>
                        </td>
                        <td>
                          {done ? (
                            <span style={{ color: 'var(--orange)', fontSize: 10, fontWeight: 700 }}>Already Returned</span>
                          ) : (
                            <span style={{ color: 'var(--accent)', fontSize: 10 }}>Returnable</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mf">
            <span style={{ marginRight: 'auto', fontSize: 11.5, color: 'var(--text2)', alignSelf: 'center' }}>
              Selected:{' '}
              <b style={{ color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{serialDraft.size}</b>
            </span>
            <button type="button" className="bs" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button type="button" className="bp" onClick={confirmSerials}>
              Confirm Serials
            </button>
          </div>
        </div>
      </div>

      {/* Invoice picker */}
      <div className={`mo${modal === 'invoice' ? ' active' : ''}`} onClick={(e) => e.target === e.currentTarget && setModal(null)}>
        <div className="md wide">
          <div className="mh">
            <span className="mhi">🧾</span>
            <span className="mt">Select Invoice for Return</span>
            <button type="button" className="mc" onClick={() => setModal(null)}>
              ✕
            </button>
          </div>
          <div className="mb">
            {Object.keys(invoiceDB).map((k) => {
              const inv = invoiceDB[k];
              const amt = inv.items.reduce((s, i) => s + (i.price - i.disc) * i.sold, 0);
              const dues = inv.items.reduce((s, i) => s + (i.sold - i.returned), 0);
              return (
                <div
                  key={k}
                  className="inv-item"
                  onClick={() => {
                    setInvoiceNo(k);
                    setModal(null);
                    loadInvoice(k, false);
                  }}
                >
                  <div>
                    <div className="ii-inv">{k}</div>
                    <div className="ii-cust">{inv.customer}</div>
                    <div className="ii-meta">
                      {inv.date} · {inv.items.length} items · {dues} returnable
                    </div>
                  </div>
                  <div className="ii-amt">৳ {fmt(amt)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* QR modal */}
      <div className={`mo${modal === 'qr' ? ' active' : ''}`} onClick={(e) => e.target === e.currentTarget && setModal(null)}>
        <div className="md qr">
          <div className="mh">
            <span className="mhi">📷</span>
            <span className="mt">QR / Barcode Scan</span>
            <button type="button" className="mc" onClick={() => setModal(null)}>
              ✕
            </button>
          </div>
          <div className="mb" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div className="qr-frame">
              <div className="qr-line" />
              <span style={{ fontSize: 34, color: 'var(--text3)' }}>📷</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>Scanning…</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Point at QR code or barcode</div>
            </div>
            <div style={{ width: '100%' }}>
              <div className="mfll">Or type / paste barcode manually</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="mfi" value={qrManual} onChange={(e) => setQrManual(e.target.value)} placeholder="Enter barcode / invoice…" style={{ flex: 1 }} />
                <button
                  type="button"
                  className="bp"
                  style={{ padding: '0 12px', fontSize: 12 }}
                  onClick={() => {
                    const v = qrManual.trim();
                    setModal(null);
                    setQrManual('');
                    if (v) applyMultiScan(v);
                  }}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
          <div className="mf">
            <button type="button" className="bs" onClick={() => setModal(null)}>
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* More modal */}
      <div className={`mo${modal === 'more' ? ' active' : ''}`} onClick={(e) => e.target === e.currentTarget && setModal(null)}>
        <div className="md" style={{ width: 360 }}>
          <div className="mh">
            <span className="mhi">⋯</span>
            <span className="mt">More Actions</span>
            <button type="button" className="mc" onClick={() => setModal(null)}>
              ✕
            </button>
          </div>
          <div className="mb" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              className="bs"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => {
                setModal(null);
                showToast('A5 report printing…', '📄');
              }}
            >
              📄 Print A5 Report
            </button>
            <button
              type="button"
              className="bs"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => {
                setModal(null);
                showToast('Return challan created', '📑');
              }}
            >
              📑 Return Challan
            </button>
            <button
              type="button"
              className="bs"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => {
                setModal(null);
                showToast('Exported to Excel', '📊');
              }}
            >
              📊 Export to Excel
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
