import { getApiBaseUrl, getBr2ReportBaseUrl, getLoginSession } from '../../../config/runtimeConfig';

/** BR2 report param: UserName + DBZ + (empty) + DBZ + CompanyName */
function buildBr2ReportParameter(): string {
  const session = getLoginSession();
  const userName = session.securityUserName?.trim() || '';
  const companyName = session.companyName?.trim() || '';
  return `${userName}DBZDBZ${companyName}`;
}

function openBr2ReportViewer(
  reportName: string,
  filterOrKey: string,
  parameter?: string,
  options?: { autoPrint?: boolean },
): { ok: boolean; error?: string } {
  const base = getBr2ReportBaseUrl();
  if (!base) {
    return {
      ok: false,
      error: 'Set br2ReportBaseUrl in apiSettings.json (e.g. http://host/BRReports).',
    };
  }

  const param = parameter ?? buildBr2ReportParameter();
  const items = [reportName, filterOrKey, param].join(',');
  let url = `${base}/ReportViewer.aspx?items=${items}`;
  if (options?.autoPrint) {
    url += '&autoPrint=1';
  }

  const features =
    `width=${screen.width},height=${screen.height},fullscreen=no,toolbar=no,status=no,menubar=no,scrollbars=Yes,resizable=no,directories=no,location=no`;
  const win = window.open(url, '', features);
  if (!win) {
    return { ok: false, error: 'Popup was blocked. Allow popups for this site.' };
  }
  return { ok: true };
}

/**
 * Opens BR2 Crystal ReportViewer for InvoiceSummary_SMART.rpt
 * via report key InvoiceReportWithSalesOrder.
 *
 * BR2 items shape:
 *   InvoiceReportWithSalesOrder,{SalesOrder.InvoiceNo}='…',UserNameDBZDBZCompanyName
 */
export function openBr2InvoiceReportWithSalesOrder(invoiceNo: string): {
  ok: boolean;
  error?: string;
} {
  const trimmed = invoiceNo.trim();
  if (!trimmed) {
    return { ok: false, error: 'Invoice number is required.' };
  }

  return openBr2ReportViewer(
    'InvoiceReportWithSalesOrder',
    `{SalesOrder.InvoiceNo}='${trimmed}'`,
    buildBr2ReportParameter(),
  );
}

/**
 * Same report as BR2 PosSales `ShowReportPOSNew()` (InvoicePOS):
 *   InvoiceReportWithSalesOrderPOS → InvoiceSummary_SMARTPOS.rpt
 *
 * Why a PosApi PDF proxy?
 *   Vibe (8081) cannot call print() on BR2 (8080) PDF viewer (cross-origin).
 *   Chrome also ignores delayed window.print() on a shell that only embeds a
 *   cross-origin PDF — so the report shows but the print dialog never opens.
 *   Proxying the PDF through /api makes it same-origin; iframe.contentWindow.print()
 *   then works.
 */
export function openBr2InvoiceReportWithSalesOrderPOS(invoiceNo: string): {
  ok: boolean;
  error?: string;
} {
  const trimmed = invoiceNo.trim();
  if (!trimmed) {
    return { ok: false, error: 'Invoice number is required.' };
  }

  const features =
    `width=${screen.width},height=${screen.height},fullscreen=no,toolbar=no,status=no,menubar=no,scrollbars=Yes,resizable=no,directories=no,location=no`;

  // Must open synchronously on the click (popup blockers + BR2-iframe embedding).
  const win = window.open('', '_blank', features);
  if (!win) {
    return { ok: false, error: 'Popup was blocked. Allow popups for this site.' };
  }

  win.document.open();
  win.document.write(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>Invoice POS</title></head>
<body style="margin:0;font:14px/1.4 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#f6f7f9;color:#333;">
  Loading invoice PDF…
</body>
</html>`);
  win.document.close();

  const userName = getLoginSession().securityUserName?.trim() || '';
  const apiUrl =
    `${getApiBaseUrl()}/pos/reports/invoice-pos-pdf` +
    `?invoiceNo=${encodeURIComponent(trimmed)}` +
    `&userName=${encodeURIComponent(userName)}`;

  // Direct BR2 URL — view-only fallback if proxy fails.
  const br2Base = getBr2ReportBaseUrl();
  const br2FallbackUrl = br2Base
    ? `${br2Base.replace(/\/$/, '')}/ReportViewer.aspx?items=${encodeURIComponent(
        ['InvoiceReportWithSalesOrderPOS', `{SalesOrder.InvoiceNo}='${trimmed}'`, userName].join(','),
      )}`
    : '';

  void (async () => {
    try {
      const res = await fetch(apiUrl, { cache: 'no-store' });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      if (!blob.type.includes('pdf') && blob.size < 100) {
        throw new Error('Proxy did not return a PDF.');
      }
      const blobUrl = URL.createObjectURL(blob);
      if (win.closed) {
        URL.revokeObjectURL(blobUrl);
        return;
      }

      win.document.open();
      win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice POS</title>
  <style>
    html, body { margin: 0; height: 100%; background: #fff; overflow: hidden; }
    #pdfFrame { border: 0; width: 100%; height: 100%; display: block; }
  </style>
</head>
<body>
  <iframe id="pdfFrame" src="${blobUrl}" title="Invoice POS PDF"></iframe>
  <script>
    (function () {
      var frame = document.getElementById('pdfFrame');
      var printed = false;
      function doPrint() {
        if (printed) return;
        printed = true;
        try { window.focus(); } catch (e0) {}
        try {
          if (frame && frame.contentWindow) {
            frame.contentWindow.focus();
            frame.contentWindow.print();
            return;
          }
        } catch (e1) {}
        try { window.print(); } catch (e2) {}
      }
      if (frame) {
        frame.addEventListener('load', function () {
          // Same-origin blob PDF: contentWindow.print() works after paint.
          setTimeout(doPrint, 400);
        });
      }
      setTimeout(doPrint, 4000);
    })();
  </script>
</body>
</html>`);
      win.document.close();
      try {
        win.focus();
      } catch {
        /* ignore */
      }
    } catch {
      if (!win.closed && br2FallbackUrl) {
        win.location.href = br2FallbackUrl;
      } else if (!win.closed) {
        win.document.open();
        win.document.write(
          '<!DOCTYPE html><html><body style="font:14px sans-serif;padding:24px;">Could not load invoice PDF for auto-print.</body></html>',
        );
        win.document.close();
      }
    }
  })();

  return { ok: true };
}

/**
 * Opens BR2 Crystal ReportViewer for IndividualDeliveryChallan.rpt
 * via report key IndividualDeliveryChallan.
 *
 * BR2 items shape:
 *   IndividualDeliveryChallan,<InvoiceNo>,UserNameDBZDBZCompanyName
 */
export function openBr2IndividualDeliveryChallan(invoiceNo: string): {
  ok: boolean;
  error?: string;
} {
  const trimmed = invoiceNo.trim();
  if (!trimmed) {
    return { ok: false, error: 'Invoice number is required.' };
  }

  return openBr2ReportViewer('IndividualDeliveryChallan', trimmed, buildBr2ReportParameter());
}
