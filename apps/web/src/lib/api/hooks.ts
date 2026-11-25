'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from './client';
import type {
  AuditLogEntry,
  Container,
  Customer,
  DashboardSummary,
  LoginResponse,
  Paginated,
  ShipmentDetail,
  ShipmentEvent,
  ShipmentStatus,
  ShipmentSummary,
  User,
} from './types';

export const queryKeys = {
  me: ['me'] as const,
  dashboard: ['dashboard'] as const,
  shipments: (params: ShipmentListParams) => ['shipments', params] as const,
  shipment: (id: string) => ['shipment', id] as const,
  shipmentEvents: (id: string) => ['shipment', id, 'events'] as const,
  customers: (params: object) => ['customers', params] as const,
  customer: (id: string) => ['customer', id] as const,
  containers: (params: object) => ['containers', params] as const,
  auditLogs: (params: object) => ['audit-logs', params] as const,
};

// --- auth -------------------------------------------------------------------------------------

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiRequest<User>('/auth/me'),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      apiRequest<LoginResponse>('/auth/login', { method: 'POST', body }),
    meta: { skipAuthRedirect: true },
    onSuccess: (res) => {
      qc.clear();
      qc.setQueryData(queryKeys.me, res.user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<void>('/auth/logout', { method: 'POST' }),
    meta: { skipAuthRedirect: true },
    onSettled: () => qc.clear(),
  });
}

// --- dashboard --------------------------------------------------------------------------------

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => apiRequest<DashboardSummary>('/dashboard/summary'),
    refetchInterval: 60_000,
  });
}

// --- shipments --------------------------------------------------------------------------------

export interface ShipmentListParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: ShipmentStatus;
  customerId?: string;
  overdue?: 'true' | 'false';
  sortBy: 'createdAt' | 'estimatedDeliveryAt';
  sortOrder: 'asc' | 'desc';
}

export function useShipments(params: ShipmentListParams) {
  return useQuery({
    queryKey: queryKeys.shipments(params),
    queryFn: ({ signal }) =>
      apiRequest<Paginated<ShipmentSummary>>('/shipments', { query: { ...params }, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useShipment(id: string) {
  return useQuery({
    queryKey: queryKeys.shipment(id),
    queryFn: () => apiRequest<ShipmentDetail>(`/shipments/${encodeURIComponent(id)}`),
  });
}

export function useShipmentEvents(id: string) {
  return useQuery({
    queryKey: queryKeys.shipmentEvents(id),
    queryFn: () => apiRequest<ShipmentEvent[]>(`/shipments/${encodeURIComponent(id)}/events`),
  });
}

export interface CreateShipmentBody {
  customerId: string;
  containerId: string;
  origin: string;
  destination: string;
  estimatedDeliveryAt: string;
  notes?: string;
}

function useInvalidateShipmentData() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: ['shipments'] });
    void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    void qc.invalidateQueries({ queryKey: ['containers'] });
    void qc.invalidateQueries({ queryKey: ['customers'] });
    void qc.invalidateQueries({ queryKey: ['audit-logs'] });
    if (id) void qc.invalidateQueries({ queryKey: ['shipment', id] });
  };
}

export function useCreateShipment() {
  const invalidate = useInvalidateShipmentData();
  return useMutation({
    mutationFn: (body: CreateShipmentBody) =>
      apiRequest<ShipmentDetail>('/shipments', { method: 'POST', body }),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateShipment(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateShipmentData();
  return useMutation({
    mutationFn: (body: Partial<CreateShipmentBody> & { notes?: string | null }) =>
      apiRequest<ShipmentDetail>(`/shipments/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
    onSuccess: (detail) => {
      qc.setQueryData(queryKeys.shipment(id), detail);
      invalidate(id);
    },
  });
}

export function useChangeShipmentStatus(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateShipmentData();
  return useMutation({
    mutationFn: (body: { status: ShipmentStatus; remarks?: string }) =>
      apiRequest<ShipmentDetail>(`/shipments/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: (detail) => {
      qc.setQueryData(queryKeys.shipment(id), detail);
      invalidate(id);
    },
    // A 409 means our copy is stale (someone else moved it): refresh so the UI shows the truth.
    onError: () => invalidate(id),
  });
}

// --- customers --------------------------------------------------------------------------------

export function useCustomers(params: { page?: number; pageSize?: number; search?: string }) {
  return useQuery({
    queryKey: queryKeys.customers(params),
    queryFn: ({ signal }) =>
      apiRequest<Paginated<Customer>>('/customers', { query: params, signal }),
    placeholderData: keepPreviousData,
  });
}

export interface CustomerBody {
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
}

export function useSaveCustomer(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CustomerBody) =>
      id
        ? apiRequest<Customer>(`/customers/${encodeURIComponent(id)}`, { method: 'PATCH', body })
        : apiRequest<Customer>('/customers', { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] });
      void qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

// --- containers -------------------------------------------------------------------------------

export function useContainers(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  available?: 'true' | 'false';
}) {
  return useQuery({
    queryKey: queryKeys.containers(params),
    queryFn: ({ signal }) =>
      apiRequest<Paginated<Container>>('/containers', { query: params, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useCreateContainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { containerNumber: string; containerType: string }) =>
      apiRequest<Container>('/containers', { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['containers'] });
      void qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

// --- audit ------------------------------------------------------------------------------------

export function useAuditLogs(
  params: {
    page?: number;
    pageSize?: number;
    entityType?: string;
    entityId?: string;
    action?: string;
  },
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.auditLogs(params),
    queryFn: ({ signal }) =>
      apiRequest<Paginated<AuditLogEntry>>('/audit-logs', { query: params, signal }),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}
