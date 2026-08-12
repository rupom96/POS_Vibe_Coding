import fs from 'fs';
import path from 'path';

const data = JSON.parse(
  fs.readFileSync('.print-test-data.json', 'utf8').replace(/^\uFEFF/, ''),
);
const print = data.print;
const inv = data.invoice;
const company = print.company;
const payModeName = data.payModeName || '';
const salesPersonName = data.salesPersonName || '';

function underThousand(n) {
  const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o ? `${TENS[t]} ${ONES[o]}` : TENS[t];
  }
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return rest ? `${ONES[h]} Hundred ${underThousand(rest)}` : `${ONES[h]} Hundred`;
}

function amountInWords(value) {
  const amount = Math.abs(Number.isFinite(value) ? value : 0);
  const whole = Math.floor(amount);
  const paisa = Math.round((amount - whole) * 100);
  if (whole === 0 && paisa === 0) return 'Zero Only';
  const parts = [];
  let n = whole;
  const crore = Math.floor(n / 1e7);
  if (crore) {
    parts.push(`${underThousand(crore)} Crore`);
    n %= 1e7;
  }
  const lakh = Math.floor(n / 1e5);
  if (lakh) {
    parts.push(`${underThousand(lakh)} Lakh`);
    n %= 1e5;
  }
  const thousand = Math.floor(n / 1000);
  if (thousand) {
    parts.push(`${underThousand(thousand)} Thousand`);
    n %= 1000;
  }
  if (n) parts.push(underThousand(n));
  let text = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (paisa > 0) text = `${text || 'Zero'} and ${underThousand(paisa)} Paisa`;
  return `${text} Only`;
}

const money = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const contactLine = (c) =>
  `Phone : ${c.phone || ''} Fax : ${c.fax ?? '0'} E-mail : ${c.email || ''} Web : ${c.url || ''}`;
const lineGross = (l) => l.quantity * l.unitPrice - (l.discount || 0);

let totalAmt = 0;
for (const l of inv.lines) totalAmt += lineGross(l);
const disc = inv.invoiceDiscount || 0;
const salesAmount = inv.grandTotal ?? totalAmt - disc;
const previousDue = 0;
const collected = print.collectedAmount;
const outstanding = previousDue + salesAmount - collected;

const cssFile = fs.readFileSync('src/modules/pos/utils/printHtml.ts', 'utf8');
const m = cssFile.match(/export const INVOICE_PRINT_CSS = `([\s\S]*?)`;/);
if (!m) throw new Error('Could not extract INVOICE_PRINT_CSS');
const INVOICE_PRINT_CSS = m[1];

const kv = (label, value) =>
  `<div class="city-rpt-kv"><span class="k">${label}</span><span class="s">:</span><span class="v">${value ?? ''}</span></div>`;

function tablePos(lines) {
  return `<table class="city-rpt-table"><thead><tr>
<th class="col-sl">S/L</th><th>Item Particulars</th><th class="col-qty">Quantity</th><th class="col-up">Unit Price</th><th class="col-tot">Total</th>
</tr></thead><tbody>${lines
    .map(
      (l, i) => `<tr>
<td class="c">${i + 1}</td>
<td class="l"><div class="city-rpt-prod">${l.productName}</div><div class="city-rpt-wday">W. Day&nbsp;&nbsp;${l.warrantyDays || 0}</div></td>
<td class="c">${l.quantity}</td>
<td class="r">${money(l.unitPrice)}</td>
<td class="r">${money(lineGross(l))}</td>
</tr>`,
    )
    .join('')}</tbody></table>`;
}

function tableMain(lines) {
  return `<table class="city-rpt-table"><thead><tr>
<th class="col-sl">S/L</th><th>Item Particulars</th><th class="col-wd">Warranty Days</th><th class="col-qty">Quantity</th><th class="col-up">Unit Price</th><th class="col-tot">Total</th>
</tr></thead><tbody>${lines
    .map(
      (l, i) => `<tr>
<td class="c">${i + 1}</td>
<td class="l city-rpt-prod">${l.productName}</td>
<td class="c">${l.warrantyDays || 0}</td>
<td class="c">${l.quantity}</td>
<td class="r">${money(l.unitPrice)}</td>
<td class="r">${money(lineGross(l))}</td>
</tr>`,
    )
    .join('')}</tbody></table>`;
}

function build(variant) {
  const isMain = variant === 'main';
  const cls = isMain ? 'city-rpt city-rpt--main' : 'city-rpt city-rpt--pos';
  const right = isMain
    ? [
        kv('Date', inv.invoiceDate?.slice?.(0, 10) || ''),
        kv('Sold By', salesPersonName),
        kv('Verified  By', print.verifiedByName),
        kv('Billing By', print.billingByName),
        kv('Promise Mode', payModeName),
        kv('Sales Person By', salesPersonName),
      ].join('')
    : [
        kv('Date', inv.invoiceDate?.slice?.(0, 10) || ''),
        kv('Sold By', salesPersonName),
        kv('Verified  By', print.verifiedByName),
        kv('Billing By', print.billingByName),
        kv('Sales Person', salesPersonName),
      ].join('');

  const signs = isMain
    ? `<div class="city-rpt-signs"><div><div class="city-rpt-sign-gap"></div><div class="city-rpt-sign-lab">Check By</div></div>
       <div><div class="city-rpt-sign-gap"></div><div class="city-rpt-sign-lab">Authorised Signature And Company Stamp</div></div>
       <div><div class="city-rpt-sign-gap"></div><div class="city-rpt-sign-lab">Received with good condition By</div></div></div>
       <div class="city-rpt-warranty"><p>Warranty will be void if there any physical damage to the product or warranty sticker are removed and sold goods are not refundable.</p>
       <p>Keyboard, Mouse, Power Supply, Speaker, Remote, Adapter, Bluetooth, Toner, Any Kind Of Camera don't Carry any warranty.</p></div>`
    : `<div class="city-rpt-signs"><div><div class="city-rpt-sign-gap"></div><div class="city-rpt-sign-lab">Received with good condition By</div></div>
       <div><div class="city-rpt-sign-gap"></div><div class="city-rpt-sign-lab">Authorised Signature</div></div></div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${INVOICE_PRINT_CSS}</style></head><body>
  <div class="${cls}">
    <div class="city-rpt-co">${company.name}</div>
    <div class="city-rpt-addr">${company.address || ''}</div>
    <div class="city-rpt-phone">${contactLine(company)}</div>
    <div class="city-rpt-doc-title">Invoice/ Bill</div>
    <div class="city-rpt-meta">
      <div class="city-rpt-meta-left">
        ${kv('Sold To', inv.customerName)}
        ${kv('Address', inv.address || '')}
        ${kv('Contact  No', inv.mobile || '')}
        ${kv('Invoice No', inv.invoiceNo)}
        ${kv('S. Order No', inv.salesOrderNo || print.salesOrderNo)}
        ${kv('Remarks', inv.remarks || '')}
      </div>
      <div class="city-rpt-meta-right">${right}</div>
    </div>
    ${isMain ? tableMain(inv.lines) : tablePos(inv.lines)}
    <div class="city-rpt-sum">
      <div>
        <div class="city-rpt-words-lab">Amount In Words :</div>
        <div class="city-rpt-words-val">${amountInWords(salesAmount)}</div>
      </div>
      <div class="city-rpt-sum-lines">
        <div><span class="lab">TOTAL :</span><span class="amt">${money(totalAmt)}</span></div>
        <div><span class="lab">Discount:</span><span class="amt">${money(disc)}</span></div>
        <div class="grand"><span class="lab">Grand TOTAL :</span><span class="amt">${money(salesAmount)}</span></div>
      </div>
    </div>
    <div class="city-rpt-dues">
      <div class="city-rpt-dues-left">
        ${kv('Previous Due', money(previousDue))}
        ${kv('Sales Amount', money(salesAmount))}
        ${kv('Collected Amount', money(collected))}
        ${kv('Outsanding Amount', money(outstanding))}
      </div>
      <div class="city-rpt-dues-right"></div>
    </div>
    ${signs}
    <div class="city-rpt-print-foot">
      <span>Print Date test</span>
      <span class="site">www.databizsoftware.com</span>
      ${isMain ? '<span>Page 1 of 1</span>' : ''}
    </div>
  </div>
  </body></html>`;
}

const outDir = path.resolve('.print-test-out');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'invoice-pos.html'), build('pos'));
fs.writeFileSync(path.join(outDir, 'report-main.html'), build('main'));
console.log('Wrote HTML to', outDir);

const samplePosLabels = [
  'Sold To',
  'Contact  No',
  'Invoice No',
  'S. Order No',
  'Remarks',
  'Date',
  'Sold By',
  'Verified  By',
  'Billing By',
  'Sales Person',
  'Item Particulars',
  'Quantity',
  'Unit Price',
  'Total',
  'W. Day',
  'Amount In Words',
  'TOTAL',
  'Discount',
  'Grand TOTAL',
  'Previous Due',
  'Sales Amount',
  'Collected Amount',
  'Outsanding Amount',
  'Authorised Signature',
  'Received with good condition By',
  'www.databizsoftware.com',
  'Invoice/ Bill',
  'Phone :',
  'Fax :',
  'E-mail :',
  'Web :',
];

const sampleMainLabels = [
  ...samplePosLabels.filter((x) => x !== 'Sales Person' && x !== 'W. Day'),
  'Sales Person By',
  'Promise Mode',
  'Warranty Days',
  'Check By',
  'Authorised Signature And Company Stamp',
  "don't Carry any warranty",
  'Page 1 of 1',
];

function check(html, labels, name) {
  const missing = labels.filter((l) => !html.includes(l));
  console.log(`\n== ${name} label check ==`);
  console.log('missing:', missing.length ? missing.join(' | ') : 'NONE');
  console.log('pass:', missing.length === 0);
  return missing;
}

const posHtml = build('pos');
const mainHtml = build('main');
const m1 = check(posHtml, samplePosLabels, 'Invoice POS');
const m2 = check(mainHtml, sampleMainLabels, 'Report MAIN');

console.log('\n== Data mapping checks ==');
const checks = [
  ['company.name', company.name === 'Databiz software Ltd'],
  ['billingBy Head office', print.billingByName === 'Head office'],
  ['verifiedBy DATABIZ', print.verifiedByName === 'DATABIZ'],
  ['collectedAmount==129', collected === 129],
  ['salesAmount==grandTotal 129', salesAmount === 129],
  ['line total 3*43=129', lineGross(inv.lines[0]) === 129],
  ['outstanding = prev+sale-coll = 0', outstanding === 0],
  ['SO no match', print.salesOrderNo === inv.salesOrderNo],
  ['POS W. Day only', posHtml.includes('W. Day') && !posHtml.includes('Warranty Days')],
  ['MAIN Warranty Days only', mainHtml.includes('Warranty Days') && !mainHtml.includes('W. Day')],
  ['POS no Promise Mode', !posHtml.includes('Promise Mode')],
  ['MAIN has Promise Mode Cash', mainHtml.includes('Promise Mode') && mainHtml.includes('Cash')],
  ['POS Authed once', (posHtml.match(/Authorised Signature/g) || []).length === 1],
  ['MAIN three signature labels', mainHtml.includes('Check By') && mainHtml.includes('Authorised Signature And Company Stamp')],
  [
    'amount words One Hundred Twenty Nine Only',
    amountInWords(129) === 'One Hundred Twenty Nine Only',
  ],
];

let fail = 0;
for (const [n, ok] of checks) {
  console.log(ok ? 'PASS' : 'FAIL', '-', n);
  if (!ok) fail++;
}

const posSrc = fs.readFileSync('src/modules/pos/components/modals/InvoicePosPrintModal.tsx', 'utf8');
const repSrc = fs.readFileSync('src/modules/pos/components/modals/InvoiceReportModal.tsx', 'utf8');
const srcChecks = [
  ['POS uses city-rpt--pos', posSrc.includes('city-rpt--pos')],
  ['Report uses city-rpt--main', repSrc.includes('city-rpt--main')],
  ['POS prints via printHtmlElement', posSrc.includes('printHtmlElement')],
  ['POS company before title', /city-rpt-co[\s\S]*Invoice\/ Bill/.test(posSrc)],
  ['POS Sales Person after Billing', /Billing By[\s\S]*Sales Person/.test(posSrc)],
  ['Report Promise Mode', repSrc.includes('Promise Mode')],
  ['Report Warranty Days', repSrc.includes('Warranty Days')],
  ['POS W. Day under product', posSrc.includes('W. Day')],
  ['Outsanding spelling both', posSrc.includes('Outsanding Amount') && repSrc.includes('Outsanding Amount')],
];

console.log('\n== Source structure checks ==');
for (const [n, ok] of srcChecks) {
  console.log(ok ? 'PASS' : 'FAIL', '-', n);
  if (!ok) fail++;
}

// API response shape camelCase as frontend expects
const apiShape = [
  ['company nested', !!print.company?.name],
  ['company.url exists', 'url' in print.company],
  ['billingByName', 'billingByName' in print],
  ['verifiedByName', 'verifiedByName' in print],
  ['collectedAmount', 'collectedAmount' in print],
  ['salesOrderNo', 'salesOrderNo' in print],
];
console.log('\n== API shape checks ==');
for (const [n, ok] of apiShape) {
  console.log(ok ? 'PASS' : 'FAIL', '-', n);
  if (!ok) fail++;
}

console.log('\nSUMMARY misses POS', m1.length, 'MAIN', m2.length, 'otherFails', fail);
console.log('Values used:');
console.log({
  invoiceNo: inv.invoiceNo,
  company: company.name,
  billingBy: print.billingByName,
  verifiedBy: print.verifiedByName,
  salesPerson: salesPersonName,
  payMode: payModeName,
  salesAmount,
  collected,
  previousDue,
  outstanding,
  amountWords: amountInWords(salesAmount),
});

process.exit(m1.length || m2.length || fail ? 1 : 0);
