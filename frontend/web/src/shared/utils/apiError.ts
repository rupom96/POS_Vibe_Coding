import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

export function getApiErrorMessage(err: unknown, fallback = 'Request failed'): string {
  if (!err || typeof err !== 'object') return fallback;

  if ('data' in err) {
    const data = (err as { data?: unknown }).data;
    if (typeof data === 'string' && data.trim()) return data;
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      if (typeof record.message === 'string' && record.message.trim()) return record.message;
      if (typeof record.title === 'string' && record.title.trim()) return record.title;
      if (typeof record.detail === 'string' && record.detail.trim()) return record.detail;
    }
  }

  if ('error' in err && typeof (err as { error?: unknown }).error === 'string') {
    return (err as { error: string }).error;
  }

  if ('message' in err && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }

  const fetchErr = err as FetchBaseQueryError;
  if (typeof fetchErr.status === 'number') {
    return `Request failed (${fetchErr.status})`;
  }

  return fallback;
}
