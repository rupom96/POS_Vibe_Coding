export interface LoginSession {
  companyId: number;
  companyName: string;
  locationId: number;
  locationName: string;
  securityUserId: number;
  securityUserName: string;
  employeeId: number;
  employeeName: string;
}

export interface ApiSettings {
  baseUrl: string;
  appBaseUrl?: string;
}

interface Br2SessionResponse {
  companyId: number;
  locationId: number;
  securityUserId: number;
  employeeId: number;
  companyName: string;
  locationName: string;
  securityUserName: string;
  employeeName: string;
  access_token?: string;
  error?: string;
}

const DEFAULT_SESSION: LoginSession = {
  companyId: 1,
  companyName: '',
  locationId: 1,
  locationName: '',
  securityUserId: 1,
  securityUserName: '',
  employeeId: 1,
  employeeName: '',
};

const DEFAULT_API: ApiSettings = {
  baseUrl: 'http://localhost:5080/api',
};

const EMBED_FLAG_KEY = 'pos.embeddedMode';
const EMBED_SESSION_KEY = 'pos.br2LoginSession';
const ACCESS_TOKEN_KEY = 'pos.access_token';

export let loginSession: LoginSession = { ...DEFAULT_SESSION };
export let apiSettings: ApiSettings = { ...DEFAULT_API };

let loaded = false;
let embeddedMode = false;

function configUrl(fileName: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}${fileName}`.replace(/\/{2,}/g, '/').replace(':/', '://');
}

function readBr2TokenFromUrl(): string | null {
  const token = new URLSearchParams(window.location.search).get('t')?.trim();
  return token || null;
}

function stripTokenAndLandOnPos(): void {
  const base = import.meta.env.BASE_URL || '/';
  const posPath = `${base}pos`.replace(/\/{2,}/g, '/').replace(':/', '://');
  const url = new URL(window.location.href);
  url.searchParams.delete('t');
  const search = url.searchParams.toString();
  const next = `${posPath}${search ? `?${search}` : ''}${url.hash}`;
  window.history.replaceState(null, '', next);
}

function persistEmbeddedSession(session: LoginSession, accessToken?: string): void {
  sessionStorage.setItem(EMBED_FLAG_KEY, '1');
  sessionStorage.setItem(EMBED_SESSION_KEY, JSON.stringify(session));
  if (accessToken) {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  }
}

function restoreEmbeddedSession(): LoginSession | null {
  if (sessionStorage.getItem(EMBED_FLAG_KEY) !== '1') return null;
  const raw = sessionStorage.getItem(EMBED_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LoginSession;
  } catch {
    return null;
  }
}

function mapBr2Session(data: Br2SessionResponse): LoginSession {
  return {
    companyId: Number(data.companyId) || 0,
    companyName: data.companyName ?? '',
    locationId: Number(data.locationId) || 0,
    locationName: data.locationName ?? '',
    securityUserId: Number(data.securityUserId) || 0,
    securityUserName: data.securityUserName ?? '',
    employeeId: Number(data.employeeId) || 0,
    employeeName: data.employeeName ?? '',
  };
}

async function loadApiSettings(): Promise<ApiSettings> {
  const apiRes = await fetch(configUrl('apiSettings.json'), { cache: 'no-store' });
  if (!apiRes.ok) {
    throw new Error(`Failed to load apiSettings.json (${apiRes.status})`);
  }
  const settings = (await apiRes.json()) as ApiSettings;
  if (!settings.baseUrl?.trim()) {
    throw new Error('apiSettings.json: baseUrl is required');
  }
  return settings;
}

async function loadStaticLoginSession(): Promise<LoginSession> {
  const sessionRes = await fetch(configUrl('StaticLoginSession.json'), { cache: 'no-store' });
  if (!sessionRes.ok) {
    throw new Error(`Failed to load StaticLoginSession.json (${sessionRes.status})`);
  }
  return (await sessionRes.json()) as LoginSession;
}

async function loadBr2LoginSession(apiBase: string, token: string): Promise<LoginSession> {
  const res = await fetch(`${apiBase}/auth/br2-session?t=${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });

  let body: Br2SessionResponse | null = null;
  try {
    body = (await res.json()) as Br2SessionResponse;
  } catch {
    body = null;
  }

  if (!res.ok) {
    throw new Error(body?.error || `BR2 session failed (${res.status})`);
  }
  if (!body) {
    throw new Error('BR2 session returned an empty response');
  }

  const session = mapBr2Session(body);
  if (session.companyId <= 0 || session.locationId <= 0 || session.securityUserId <= 0) {
    throw new Error('BR2 session response is missing required company/location/user fields');
  }

  persistEmbeddedSession(session, body.access_token);
  return session;
}

export function isRuntimeConfigLoaded(): boolean {
  return loaded;
}

export function isEmbeddedMode(): boolean {
  return embeddedMode;
}

export function getLoginSession(): LoginSession {
  if (!loaded) {
    throw new Error('Runtime config is not loaded yet.');
  }
  return loginSession;
}

export function getApiBaseUrl(): string {
  if (!loaded) {
    throw new Error('Runtime config is not loaded yet.');
  }
  return apiSettings.baseUrl.replace(/\/+$/, '');
}

export function getScanRelayHubUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin.replace(/\/+$/, '')}/hubs/scan-relay`;
  }
  const apiBase = getApiBaseUrl();
  const origin = apiBase.replace(/\/api\/?$/i, '');
  return `${origin}/hubs/scan-relay`;
}

/** Base URL for remote-scan QR links (phone must reach this host, not localhost). */
export function getAppBaseUrl(): string {
  if (!loaded) {
    throw new Error('Runtime config is not loaded yet.');
  }

  const configured = apiSettings.appBaseUrl?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  const origin = window.location.origin.replace(/\/+$/, '');
  const host = window.location.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    return origin;
  }

  try {
    const apiUrl = new URL(getApiBaseUrl());
    const port = window.location.port || '5173';
    return `${apiUrl.protocol}//${apiUrl.hostname}:${port}`;
  } catch {
    return origin;
  }
}

export async function loadRuntimeConfig(): Promise<void> {
  apiSettings = await loadApiSettings();
  const apiBase = apiSettings.baseUrl.replace(/\/+$/, '');
  const br2Token = readBr2TokenFromUrl();

  if (br2Token) {
    loginSession = await loadBr2LoginSession(apiBase, br2Token);
    embeddedMode = true;
    stripTokenAndLandOnPos();
  } else {
    const cached = restoreEmbeddedSession();
    if (cached) {
      loginSession = cached;
      embeddedMode = true;
    } else {
      loginSession = await loadStaticLoginSession();
      embeddedMode = false;
    }
  }

  loaded = true;
}
