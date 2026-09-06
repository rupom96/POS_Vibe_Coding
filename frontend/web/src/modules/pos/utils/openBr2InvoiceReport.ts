import { getBr2ReportBaseUrl, getLoginSession } from '../../../config/runtimeConfig';

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
  const url = `${base}/ReportViewer.aspx?items=${items}`;

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
