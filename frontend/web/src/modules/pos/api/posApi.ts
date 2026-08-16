import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import { appendScopeParams, type PosScope } from '../../../config/posSession';
import { getApiBaseUrl } from '../../../config/runtimeConfig';
import { sessionLogHeaders } from '../../../shared/utils/clientActivityLog';
import type {
  Customer,
  CustomerSearchResult,
  CustomerStats,
  InvoiceSearchResult,
  TodayInvoiceListItem,
  LoadedInvoice,
  Location,
  MultiScanResult,
  MultiScanSearchItem,
  PaymentMode,
  PriceHistoryItem,
  ProductDetail,
  ProductPriceQuote,
  ProductSearchResult,
  ProductTreeNode,
  ProductTreeSearchFilter,
  ProductTreeSearchResult,
  ProductSerialOption,
  ResolveSerialSequenceResult,
  BankOption,
  BankExpenseCharge,
  CardEmiDeduction,
  ReferenceOption,
  SalesPerson,
  PosFeatureFlags,
  BiznessEventTypeOption,
  ProjectOption,
  SaveInvoiceRequest,
  SaveInvoiceResponse,
  InvoicePrintContext,
} from '../types';
import type { CreateCustomerRequest } from '../store/posSlice';

const dynamicBaseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = (
  args,
  api,
  extraOptions,
) => {
  const url = typeof args === 'string' ? args : (args.url ?? '');
  const method = typeof args === 'string' ? 'GET' : (args.method ?? 'GET');
  return fetchBaseQuery({
    baseUrl: getApiBaseUrl(),
    prepareHeaders: (headers) => {
      const extra = sessionLogHeaders(method, url);
      for (const [key, value] of Object.entries(extra)) {
        if (value) headers.set(key, value);
      }
      return headers;
    },
  })(args, api, extraOptions);
};

export type { PosScope };

export const posApi = createApi({
  reducerPath: 'posApi',
  baseQuery: dynamicBaseQuery,
  tagTypes: ['Customers', 'Products', 'Invoice'],
  endpoints: (builder) => ({
    getHealth: builder.query<{ status: string; database: string }, void>({
      query: () => '/health',
    }),
    getLocations: builder.query<Location[], Pick<PosScope, 'companyId'> | void>({
      query: (scope) => {
        const params = new URLSearchParams();
        if (scope && scope.companyId > 0) params.set('companyId', String(scope.companyId));
        const qs = params.toString();
        return `/lookups/locations${qs ? `?${qs}` : ''}`;
      },
    }),
    getPaymentModes: builder.query<PaymentMode[], PosScope | void>({
      query: (scope) => {
        const params = new URLSearchParams();
        if (scope) appendScopeParams(params, scope);
        const qs = params.toString();
        return `/lookups/payment-modes${qs ? `?${qs}` : ''}`;
      },
    }),
    getSalesPersons: builder.query<SalesPerson[], { companyId?: number } | void>({
      query: (scope) => {
        const params = new URLSearchParams();
        if (scope?.companyId && scope.companyId > 0) {
          params.set('companyId', String(scope.companyId));
        }
        const qs = params.toString();
        return `/lookups/sales-persons${qs ? `?${qs}` : ''}`;
      },
    }),
    getReferences: builder.query<ReferenceOption[], Pick<PosScope, 'companyId'> | void>({
      query: (scope) => {
        const params = new URLSearchParams();
        if (scope && scope.companyId > 0) params.set('companyId', String(scope.companyId));
        const qs = params.toString();
        return `/lookups/references${qs ? `?${qs}` : ''}`;
      },
    }),
    getBanks: builder.query<BankOption[], { companyId?: number } | void>({
      query: (arg) => {
        const companyId = arg && 'companyId' in arg ? arg.companyId : undefined;
        return companyId ? `/lookups/banks?companyId=${companyId}` : '/lookups/banks';
      },
    }),
    getBankExpenseCharge: builder.query<
      BankExpenseCharge | null,
      { bankId: number; companyId: number }
    >({
      query: ({ bankId, companyId }) =>
        `/lookups/bank-expense?bankId=${bankId}&companyId=${companyId}`,
      transformResponse: (response: unknown): BankExpenseCharge | null => {
        if (response == null) return null;
        if (typeof response !== 'object') return null;
        const row = response as Record<string, unknown>;
        const num = (v: unknown) => {
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n : 0;
        };
        // Empty object / missing charge fields treated as a usable row only if any property exists.
        if (
          row.creditCardChargeP == null
          && row.CreditCardChargeP == null
          && row.posMachineChargeP == null
          && row.POSMachineChargeP == null
          && row.cashBackAmount == null
          && row.CashBackAmount == null
        ) {
          return null;
        }
        return {
          creditCardChargeP: num(row.creditCardChargeP ?? row.CreditCardChargeP),
          posMachineChargeP: num(row.posMachineChargeP ?? row.POSMachineChargeP),
          cashBackAmount: num(row.cashBackAmount ?? row.CashBackAmount),
        };
      },
    }),
    getCardEmiDeductions: builder.query<CardEmiDeduction[], { bankId: number }>({
      query: ({ bankId }) => `/lookups/card-emi-deductions?bankId=${Number(bankId)}`,
      transformResponse: (response: unknown): CardEmiDeduction[] => {
        if (!Array.isArray(response)) return [];
        return response
          .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const row = item as Record<string, unknown>;
            const id = Number(row.cardEmiDeductionId ?? row.CardEmiDeductionId ?? row.CardEMIDeductionId);
            const months = Number(row.noOfInstallment ?? row.NoOfInstallment);
            const rate = Number(row.deductionRate ?? row.DeductionRate);
            if (!Number.isFinite(id) || id <= 0) return null;
            return {
              cardEmiDeductionId: id,
              noOfInstallment: Number.isFinite(months) ? months : 0,
              deductionRate: Number.isFinite(rate) ? rate : 0,
            } satisfies CardEmiDeduction;
          })
          .filter((row): row is CardEmiDeduction => row != null);
      },
    }),
    getPosFeatures: builder.query<PosFeatureFlags, { companyId: number; securityUserId: number }>({
      query: ({ companyId, securityUserId }) =>
        `/lookups/pos-features?companyId=${companyId}&securityUserId=${securityUserId}`,
    }),
    
    getBiznessEventTypes: builder.query<BiznessEventTypeOption[], { companyId: number; locationId: number }>({
      query: ({ companyId, locationId }) =>
        `/lookups/bizness-event-types?companyId=${companyId}&locationId=${locationId}`,
    }),
    getProjects: builder.query<ProjectOption[], { companyId: number }>({
      query: ({ companyId }) => `/lookups/projects?companyId=${companyId}`,
    }),
    searchCustomers: builder.query<
      CustomerSearchResult[],
      { q?: string; companyId?: number; limit?: number }
    >({
      query: ({ q, companyId, limit }) => {
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (companyId) params.set('companyId', String(companyId));
        if (limit) params.set('limit', String(limit));
        return `/customers/search?${params}`;
      },
      keepUnusedDataFor: 120,
      providesTags: ['Customers'],
    }),
    getCustomer: builder.query<Customer, number>({
      query: (buyerId) => `/customers/${buyerId}`,
    }),
    getCustomerStats: builder.query<CustomerStats, number>({
      query: (buyerId) => `/customers/${buyerId}/stats`,
    }),
    getCustomerLedgerDue: builder.query<number, { buyerId: number; userId?: number }>({
      query: ({ buyerId, userId }) => {
        const params = new URLSearchParams();
        if (userId) params.set('userId', String(userId));
        const qs = params.toString();
        return `/customers/${buyerId}/ledger-due${qs ? `?${qs}` : ''}`;
      },
    }),
    createCustomer: builder.mutation<Customer, CreateCustomerRequest>({
      query: (body) => ({ url: '/customers', method: 'POST', body }),
      invalidatesTags: ['Customers'],
    }),
    searchProducts: builder.query<
      ProductSearchResult[],
      { q?: string; locationId?: number; companyId?: number; limit?: number }
    >({
      query: ({ q, locationId, companyId, limit }) => {
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (locationId) params.set('locationId', String(locationId));
        if (companyId) params.set('companyId', String(companyId));
        if (limit) params.set('limit', String(limit));
        return `/products/search?${params}`;
      },
      keepUnusedDataFor: 120,
    }),
    getProduct: builder.query<ProductDetail, { productId: number; locationId?: number; companyId?: number }>({
      query: ({ productId, locationId, companyId }) => {
        const params = new URLSearchParams();
        if (locationId) params.set('locationId', String(locationId));
        if (companyId) params.set('companyId', String(companyId));
        const qs = params.toString();
        return `/products/${productId}${qs ? `?${qs}` : ''}`;
      },
    }),
    getPriceHistory: builder.query<PriceHistoryItem[], { productId: number; buyerId?: number }>({
      query: ({ productId, buyerId }) => {
        const params = buyerId ? `?buyerId=${buyerId}` : '';
        return `/products/${productId}/price-history${params}`;
      },
    }),
    getProductPrice: builder.query<
      ProductPriceQuote | null,
      { productId: number; quantity: number; companyId: number; locationId: number }
    >({
      query: ({ productId, quantity, companyId, locationId }) => {
        const params = new URLSearchParams({
          quantity: String(quantity),
          companyId: String(companyId),
          locationId: String(locationId),
        });
        return `/products/${productId}/price?${params}`;
      },
    }),
    getProductTree: builder.query<ProductTreeNode[], void>({
      query: () => '/products/tree',
    }),
    searchProductTree: builder.query<
      ProductTreeSearchResult[],
      { q: string; filter?: ProductTreeSearchFilter; companyId?: number; locationId?: number; limit?: number }
    >({
      query: ({ q, filter, companyId, locationId, limit }) => {
        const params = new URLSearchParams({ q });
        if (filter) params.set('filter', filter);
        if (companyId) params.set('companyId', String(companyId));
        if (locationId) params.set('locationId', String(locationId));
        if (limit) params.set('limit', String(limit));
        return `/products/tree-search?${params}`;
      },
    }),
    searchProductSerials: builder.query<
      ProductSerialOption[],
      { productId: number; locationId: number; q?: string; limit?: number; exclude?: string[] }
    >({
      query: ({ productId, locationId, q, limit, exclude }) => {
        const params = new URLSearchParams({ locationId: String(locationId) });
        if (q) params.set('q', q);
        if (limit) params.set('limit', String(limit));
        exclude?.forEach((s) => params.append('exclude', s));
        return `/products/${productId}/serials/search?${params}`;
      },
      keepUnusedDataFor: 60,
    }),
    getBulkProductSerials: builder.query<
      ProductSerialOption[],
      { productId: number; locationId: number; count: number; exclude?: string[] }
    >({
      query: ({ productId, locationId, count, exclude }) => {
        const params = new URLSearchParams({
          locationId: String(locationId),
          count: String(count),
        });
        exclude?.forEach((s) => params.append('exclude', s));
        return `/products/${productId}/serials/bulk?${params}`;
      },
    }),
    getSerialPrefixes: builder.query<
      string[],
      { productId: number; locationId: number; q?: string }
    >({
      query: ({ productId, locationId, q }) => {
        const params = new URLSearchParams({ locationId: String(locationId) });
        if (q) params.set('q', q);
        return `/products/${productId}/serials/prefixes?${params}`;
      },
      keepUnusedDataFor: 60,
    }),
    resolveSerialSequence: builder.query<
      ResolveSerialSequenceResult,
      { productId: number; locationId: number; prefix: string; from: number; to: number }
    >({
      query: ({ productId, locationId, prefix, from, to }) => {
        const params = new URLSearchParams({
          locationId: String(locationId),
          prefix,
          from: String(from),
          to: String(to),
        });
        return `/products/${productId}/serials/resolve-sequence?${params}`;
      },
    }),
    searchInvoices: builder.query<
      InvoiceSearchResult[],
      { q?: string; companyId: number; locationId: number; limit?: number }
    >({
      query: ({ q, companyId, locationId, limit }) => {
        const params = new URLSearchParams({
          companyId: String(companyId),
          locationId: String(locationId),
        });
        if (q) params.set('q', q);
        if (limit) params.set('limit', String(limit));
        return `/pos/invoices/search?${params}`;
      },
      keepUnusedDataFor: 60,
    }),
    getTodayInvoices: builder.query<
      TodayInvoiceListItem[],
      { companyId: number; locationId: number; employeeId: number; limit?: number }
    >({
      query: ({ companyId, locationId, employeeId, limit }) => {
        const params = new URLSearchParams({
          companyId: String(companyId),
          locationId: String(locationId),
          employeeId: String(employeeId),
        });
        if (limit) params.set('limit', String(limit));
        return `/pos/invoices/today?${params}`;
      },
      keepUnusedDataFor: 30,
      providesTags: ['Invoice'],
    }),
    getInvoice: builder.query<LoadedInvoice, { invoiceNo: string; companyId: number; locationId: number }>({
      query: ({ invoiceNo, companyId, locationId }) =>
        `/pos/invoices/${encodeURIComponent(invoiceNo)}?companyId=${companyId}&locationId=${locationId}`,
    }),
    getInvoicePrintContext: builder.query<
      InvoicePrintContext,
      { invoiceNo: string; companyId: number; locationId: number; reportLedgerDue?: boolean }
    >({
      query: ({ invoiceNo, companyId, locationId, reportLedgerDue }) => {
        const params = new URLSearchParams({
          companyId: String(companyId),
          locationId: String(locationId),
        });
        if (reportLedgerDue) params.set('reportLedgerDue', 'true');
        return `/pos/invoices/${encodeURIComponent(invoiceNo)}/print-context?${params}`;
      },
    }),
    multiScan: builder.query<MultiScanResult, { q: string; companyId?: number; locationId?: number }>({
      query: ({ q, companyId, locationId }) => {
        const params = new URLSearchParams({ q });
        if (companyId) params.set('companyId', String(companyId));
        if (locationId) params.set('locationId', String(locationId));
        return `/pos/multi-scan?${params}`;
      },
    }),
    searchMultiScan: builder.query<MultiScanSearchItem[], { q: string; companyId?: number; locationId?: number; limit?: number }>({
      query: ({ q, companyId, locationId, limit }) => {
        const params = new URLSearchParams({ q });
        if (companyId) params.set('companyId', String(companyId));
        if (locationId) params.set('locationId', String(locationId));
        if (limit) params.set('limit', String(limit));
        return `/pos/multi-scan/search?${params}`;
      },
    }),
    saveInvoice: builder.mutation<SaveInvoiceResponse, SaveInvoiceRequest>({
      query: (body) => ({ url: '/pos/save', method: 'POST', body }),
      invalidatesTags: ['Invoice'],
    }),
  }),
});

export const {
  useGetHealthQuery,
  useGetLocationsQuery,
  useGetPaymentModesQuery,
  useGetSalesPersonsQuery,
  useGetReferencesQuery,
  useGetBanksQuery,
  useLazyGetBankExpenseChargeQuery,
  useGetCardEmiDeductionsQuery,
  useGetPosFeaturesQuery,
  useGetBiznessEventTypesQuery,
  useGetProjectsQuery,
  useSearchCustomersQuery,
  useLazySearchCustomersQuery,
  useGetCustomerQuery,
  useLazyGetCustomerQuery,
  useGetCustomerStatsQuery,
  useLazyGetCustomerStatsQuery,
  useLazyGetCustomerLedgerDueQuery,
  useCreateCustomerMutation,
  useSearchProductsQuery,
  useLazySearchProductsQuery,
  useLazyGetProductQuery,
  useLazyGetPriceHistoryQuery,
  useLazyGetProductPriceQuery,
  useGetProductTreeQuery,
  useLazySearchProductTreeQuery,
  useLazySearchProductSerialsQuery,
  useLazyGetBulkProductSerialsQuery,
  useLazyGetSerialPrefixesQuery,
  useLazyResolveSerialSequenceQuery,
  useLazySearchInvoicesQuery,
  useGetTodayInvoicesQuery,
  useLazyGetInvoiceQuery,
  useLazyGetInvoicePrintContextQuery,
  useLazyMultiScanQuery,
  useLazySearchMultiScanQuery,
  useSaveInvoiceMutation,
} = posApi;
