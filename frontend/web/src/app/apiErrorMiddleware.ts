import { isRejected, isRejectedWithValue, type Middleware } from '@reduxjs/toolkit';
import { getApiErrorMessage } from '../shared/utils/apiError';
import { showGlobalToast } from '../shared/utils/toastBridge';

const silentEndpoints = new Set(['getHealth']);
const handledInUiEndpoints = new Set(['createCustomer']);

export const apiErrorMiddleware: Middleware = () => (next) => (action) => {
  const type = String((action as { type?: string }).type ?? '');
  if (!type.startsWith('posApi/') || !type.endsWith('/rejected')) {
    return next(action);
  }

  const endpoint = (action as { meta?: { arg?: { endpointName?: string } } }).meta?.arg?.endpointName;
  if (endpoint && (silentEndpoints.has(endpoint) || handledInUiEndpoints.has(endpoint))) {
    return next(action);
  }

  const payload = isRejectedWithValue(action)
    ? action.payload
    : isRejected(action)
      ? action.error
      : undefined;

  if (payload !== undefined) {
    showGlobalToast(getApiErrorMessage(payload), '⚠');
  }

  return next(action);
};
