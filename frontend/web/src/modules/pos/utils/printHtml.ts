/** Self-contained CSS for print popup. POS matches City com IT A5 screenshot; MAIN keeps report layout. */
export const INVOICE_PRINT_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { padding: 8mm 10mm; }

  /* ========== Invoice POS (A5 sample / screenshot) ========== */
  .posa5 {
    font-family: "Times New Roman", Times, Georgia, serif;
    color: #000;
    background: #fff;
    width: 100%;
    max-width: 136mm;
    margin: 0 auto;
    font-size: 10px;
    line-height: 1.25;
  }

  .posa5-co {
    text-align: center;
    font-size: 20px;
    font-weight: 700;
    margin: 0 0 3px;
    letter-spacing: 0.3px;
    line-height: 1.15;
  }
  .posa5-addr {
    text-align: center;
    font-size: 10px;
    font-weight: 400;
    margin: 0 auto 1px;
    max-width: 95%;
    line-height: 1.3;
  }
  .posa5-phone {
    text-align: center;
    font-size: 10px;
    margin: 2px 0 8px;
  }

  .posa5-titlebar {
    background: #9a9a9a;
    color: #fff;
    text-align: center;
    font-size: 12px;
    font-weight: 700;
    padding: 4px 8px;
    margin: 0 0 10px;
    letter-spacing: 0.2px;
  }

  .posa5-meta {
    display: grid;
    grid-template-columns: 1.2fr 0.85fr;
    column-gap: 20px;
    margin-bottom: 10px;
    font-size: 10.5px;
  }
  .posa5-kv {
    display: grid;
    grid-template-columns: 78px 10px 1fr;
    align-items: baseline;
    margin-bottom: 3px;
    min-height: 14px;
  }
  .posa5-meta-right .posa5-kv {
    grid-template-columns: 72px 10px 1fr;
  }
  .posa5-kv .k {
    font-weight: 700;
    white-space: nowrap;
  }
  .posa5-kv .s {
    font-weight: 700;
    text-align: left;
  }
  .posa5-kv .v {
    font-weight: 400;
    word-break: break-word;
  }
  .posa5-kv .v.strong { font-weight: 700; }

  .posa5-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 6px;
    font-size: 10.5px;
  }
  .posa5-table th,
  .posa5-table td {
    border: 1px solid #000;
    padding: 4px 5px;
    vertical-align: top;
  }
  .posa5-table th {
    font-weight: 700;
    text-align: center;
    background: #fff;
    font-size: 10px;
    padding: 5px 4px;
  }
  .posa5-table .c { text-align: center; }
  .posa5-table .r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .posa5-table .l { text-align: left; }
  .posa5-table .col-sl { width: 32px; }
  .posa5-table .col-qty { width: 58px; }
  .posa5-table .col-up { width: 72px; }
  .posa5-table .col-tot { width: 76px; }
  .posa5-prod {
    font-weight: 700;
    text-transform: none;
  }
  .posa5-wday {
    margin-top: 6px;
    font-weight: 400;
    font-size: 10px;
  }

  .posa5-below-table {
    display: grid;
    grid-template-columns: 1fr 168px;
    gap: 4px 12px;
    margin-bottom: 8px;
    font-size: 10.5px;
    align-items: start;
  }
  .posa5-words {
    padding-top: 2px;
  }
  .posa5-words-lab {
    font-weight: 700;
    display: inline;
  }
  .posa5-words-val {
    font-weight: 400;
    display: inline;
  }
  .posa5-tots {
    padding-top: 2px;
  }
  .posa5-tots-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 2px;
  }
  .posa5-tots-row .lab { font-weight: 700; }
  .posa5-tots-row .amt {
    text-align: right;
    font-variant-numeric: tabular-nums;
    min-width: 70px;
    font-weight: 700;
  }

  .posa5-dues-wrap {
    margin: 4px 0 8px;
  }
  .posa5-dues-box {
    display: inline-block;
    border: 1px solid #000;
    padding: 6px 10px 5px;
    min-width: 210px;
    font-size: 10.5px;
  }
  .posa5-dues-row {
    display: grid;
    grid-template-columns: 118px 10px 72px;
    align-items: baseline;
    margin-bottom: 3px;
  }
  .posa5-dues-row:last-child { margin-bottom: 0; }
  .posa5-dues-row .k { font-weight: 700; }
  .posa5-dues-row .s { font-weight: 700; }
  .posa5-dues-row .a {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-weight: 400;
  }

  .posa5-signs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
    margin-top: 42px;
    text-align: center;
    font-size: 11px;
  }
  .posa5-sign-line {
    border-top: 1px solid #000;
    width: 78%;
    margin: 0 auto 6px;
  }
  .posa5-sign-lab {
    font-weight: 400;
  }

  .posa5-footer-rule {
    border: none;
    border-top: 2px solid #000;
    margin: 22px 0 6px;
  }
  .posa5-footer {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    align-items: center;
    font-size: 9.5px;
  }
  .posa5-footer .c { text-align: center; }
  .posa5-footer .r { text-align: right; }

  /* ========== Report MAIN (screenshot / City com IT REPORT) ========== */
  .rprm {
    font-family: "Times New Roman", Times, Georgia, serif;
    color: #000;
    background: #fff;
    width: 100%;
    max-width: 190mm;
    margin: 0 auto;
    font-size: 10.5px;
    line-height: 1.28;
  }
  .rprm-co {
    text-align: center;
    font-size: 24px;
    font-weight: 700;
    margin: 0 0 4px;
    letter-spacing: 0.2px;
    line-height: 1.1;
  }
  .rprm-addr {
    text-align: center;
    font-size: 10px;
    margin: 0 auto 1px;
    max-width: 98%;
    line-height: 1.3;
  }
  .rprm-phone {
    text-align: center;
    font-size: 10px;
    margin: 2px 0 8px;
  }
  .rprm-titlebar {
    background: #b8b8b8;
    color: #000;
    text-align: center;
    font-size: 13px;
    font-weight: 700;
    padding: 5px 8px;
    margin: 0 0 0;
    letter-spacing: 0.2px;
  }
  .rprm-meta {
    display: grid;
    grid-template-columns: 1.25fr 0.95fr;
    column-gap: 18px;
    padding: 8px 10px 8px;
    margin-bottom: 8px;
    background: #ececec;
    font-size: 10.5px;
    border: 1px solid #c8c8c8;
    border-top: none;
  }
  .rprm-kv {
    display: grid;
    grid-template-columns: 88px 10px 1fr;
    align-items: baseline;
    margin-bottom: 3px;
    min-height: 14px;
  }
  .rprm-meta-right .rprm-kv {
    grid-template-columns: 100px 10px 1fr;
  }
  .rprm-kv-sub { margin-top: -1px; }
  .rprm-kv .k { font-weight: 700; white-space: nowrap; }
  .rprm-kv .s { font-weight: 700; }
  .rprm-kv .v { font-weight: 400; word-break: break-word; }
  .rprm-kv .v.strong { font-weight: 700; }

  .rprm-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 8px;
    font-size: 10.5px;
  }
  .rprm-table th,
  .rprm-table td {
    border: 1px solid #000;
    padding: 4px 5px;
    vertical-align: top;
  }
  .rprm-table th {
    font-weight: 700;
    text-align: center;
    background: #d9d9d9;
    font-size: 10px;
    padding: 5px 3px;
  }
  .rprm-table .c { text-align: center; }
  .rprm-table .r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .rprm-table .l { text-align: left; }
  .rprm-table .col-sl { width: 30px; }
  .rprm-table .col-wd { width: 72px; }
  .rprm-table .col-up { width: 70px; }
  .rprm-table .col-qty { width: 54px; }
  .rprm-table .col-tot { width: 72px; }
  .rprm-prod { font-weight: 400; }

  .rprm-below {
    display: grid;
    grid-template-columns: 1fr 175px;
    gap: 8px 16px;
    align-items: start;
    margin-bottom: 6px;
    font-size: 10.5px;
  }
  .rprm-words { margin-bottom: 8px; }
  .rprm-words-lab { font-weight: 700; }
  .rprm-words-val { font-weight: 400; }

  .rprm-dues-box {
    display: inline-block;
    border: 1px solid #000;
    padding: 6px 10px 5px;
    min-width: 220px;
    font-size: 10.5px;
  }
  .rprm-dues-row {
    display: grid;
    grid-template-columns: 118px 10px 72px;
    align-items: baseline;
    margin-bottom: 4px;
  }
  .rprm-dues-row:last-child { margin-bottom: 0; }
  .rprm-dues-row .k { font-weight: 700; }
  .rprm-dues-row .s { font-weight: 700; }
  .rprm-dues-row .a {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .rprm-tots { padding-top: 0; }
  .rprm-tots-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 3px;
  }
  .rprm-tots-row .lab { font-weight: 700; }
  .rprm-tots-row .amt {
    text-align: right;
    min-width: 72px;
    font-variant-numeric: tabular-nums;
  }
  .rprm-tots-row.grand .lab,
  .rprm-tots-row.grand .amt { font-weight: 700; }

  .rprm-signs {
    display: grid;
    grid-template-columns: 1fr 1fr 1.15fr;
    gap: 16px;
    margin-top: 44px;
    text-align: center;
    font-size: 10.5px;
  }
  .rprm-sign-line {
    border-top: 1px solid #000;
    width: 85%;
    margin: 0 auto 6px;
  }
  .rprm-sign-lab { font-weight: 400; }

  .rprm-warranty {
    margin-top: 18px;
    font-size: 8.5px;
    line-height: 1.4;
  }
  .rprm-warranty p { margin: 0 0 3px; }

  .rprm-footer {
    display: grid;
    grid-template-columns: 1.1fr 1fr 1.2fr auto;
    gap: 6px 10px;
    align-items: center;
    margin-top: 20px;
    padding-top: 6px;
    border-top: 1px solid #888;
    font-size: 9.5px;
  }
  .rprm-footer .r { text-align: right; }

  .no-print { display: none !important; }
`;

export type PrintPaper = 'A4' | 'A5';

function paperPrintCss(paper: PrintPaper): string {
  if (paper === 'A5') {
    return `
  body.paper-a5 { padding: 4mm 5mm; }
  @media print {
    body { padding: 4mm 5mm; }
    @page { size: A5 portrait; margin: 6mm; }
  }`;
  }
  return `
  @media print {
    body { padding: 6mm 8mm; }
    @page { size: A4; margin: 8mm; }
  }`;
}

/** Opens a print-ready window from a DOM node (outerHTML) and triggers the print dialog. */
export function printHtmlElement(
  source: HTMLElement | null,
  title: string,
  options?: { paper?: PrintPaper },
): boolean {
  if (!source) return false;

  const paper = options?.paper ?? 'A4';
  const features = paper === 'A5' ? 'width=620,height=880' : 'width=900,height=1100';
  const win = window.open('', '_blank', features);
  if (!win) return false;

  try {
    win.opener = null;
  } catch {
    /* ignore */
  }

  const safeTitle = title.replace(/</g, '');
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>${INVOICE_PRINT_CSS}${paperPrintCss(paper)}</style>
</head>
<body class="paper-${paper.toLowerCase()}">
  ${source.outerHTML}
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();

  const runPrint = () => {
    try {
      win.focus();
      win.print();
    } finally {
      win.setTimeout(() => {
        try { win.close(); } catch { /* ignore */ }
      }, 400);
    }
  };

  if (win.document.readyState === 'complete') {
    win.setTimeout(runPrint, 80);
  } else {
    win.addEventListener('load', () => win.setTimeout(runPrint, 80));
  }

  return true;
}
