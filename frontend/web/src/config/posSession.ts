export type { LoginSession as PosSession } from './runtimeConfig';
export { getLoginSession, loginSession as posSession } from './runtimeConfig';

export interface PosScope {
  companyId: number;
  locationId: number;
}

export function appendScopeParams(
  params: URLSearchParams,
  scope: PosScope,
) {
  if (scope.companyId > 0) params.set('companyId', String(scope.companyId));
  if (scope.locationId > 0) params.set('locationId', String(scope.locationId));
}
