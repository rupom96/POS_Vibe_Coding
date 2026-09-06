import { getApiBaseUrl, isRuntimeConfigLoaded, loginSession } from '../../config/runtimeConfig';

export function currentPageName(): string {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path.endsWith('/pos')) return 'Point of Sales';
  if (path.endsWith('/sales-return')) return 'Sales Return';
  if (path.includes('/remote-scan')) return 'Remote Scan';
  if (path === '/' || path.endsWith('/index.html')) return 'Home';
  return path;
}

export function describeClientAction(method: string, url: string): string {
  const path = url.split('?')[0] ?? url;
  const m = method.toUpperCase();
  if (path.includes('/pos/save')) return 'Save Invoice';
  if (path.includes('/customers') && m === 'POST') return 'Create Customer';
  if (path.includes('/print-context')) return 'Open Invoice Report';
  if (path.includes('/invoices/') && m === 'GET') return 'Load Invoice';
  if (path.includes('/ledger-due')) return 'Load Ledger Due';
  return `${m} ${path}`;
}

export function sessionLogHeaders(method: string, url: string): Record<string, string> {
  if (!isRuntimeConfigLoaded()) return {};
  const s = loginSession;
  const encode = (value: string | number) => encodeURIComponent(String(value ?? ''));
  return {
    'X-Client-Page': encode(currentPageName()),
    'X-Client-Action': encode(describeClientAction(method, url)),
    'X-Session-SecurityUserId': String(s.securityUserId ?? ''),
    'X-Session-SecurityUserName': encode(s.securityUserName ?? ''),
    'X-Session-LocationId': String(s.locationId ?? ''),
    'X-Session-LocationName': encode(s.locationName ?? ''),
    'X-Session-CompanyId': String(s.companyId ?? ''),
    'X-Session-CompanyName': encode(s.companyName ?? ''),
    'X-Session-EmployeeId': String(s.employeeId ?? ''),
    'X-Session-EmployeeName': encode(s.employeeName ?? ''),
  };
}

export function reportClientError(error: string, how: string, action = 'Frontend error'): void {
  if (!isRuntimeConfigLoaded()) return;
  try {
    void fetch(`${getApiBaseUrl()}/logs/client-error`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...sessionLogHeaders('POST', '/logs/client-error'),
      },
      body: JSON.stringify({
        page: currentPageName(),
        action,
        how,
        error,
      }),
      keepalive: true,
    }).catch(() => { /* logging must never break the app */ });
  } catch {
    /* ignore */
  }
}

export function installClientErrorLogging(): void {
  window.addEventListener('error', (event) => {
    const message = event.error instanceof Error
      ? event.error.message
      : (event.message || 'Unknown browser error');
    reportClientError(message, `Browser error at ${event.filename || 'page'}:${event.lineno || 0}`, 'Frontend crash');
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error
      ? reason.message
      : (typeof reason === 'string' ? reason : 'Unhandled promise error');
    reportClientError(message, 'Unhandled promise rejection', 'Frontend crash');
  });
}
