import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import type { ShipmentDetail, ShipmentSummary } from '@/lib/api/types';

export function renderWithClient(ui: ReactElement, options?: RenderOptions) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>, options),
  };
}

type Handler = (init: RequestInit | undefined, url: URL) => { status: number; body?: unknown };

/**
 * Replaces global fetch with a route table keyed by "METHOD /path" (path without the /api
 * prefix and query string). Unmatched requests fail the test loudly.
 */
export function mockApi(routes: Record<string, Handler | { status: number; body?: unknown }>) {
  const calls: { method: string; path: string; url: URL; body: unknown }[] = [];
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const path = url.pathname.replace(/^\/api/, '');
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, url, body });
    const route = routes[`${method} ${path}`];
    if (!route) throw new Error(`Unexpected request: ${method} ${path}`);
    const { status, body: resBody } = typeof route === 'function' ? route(init, url) : route;
    return new Response(status === 204 ? null : JSON.stringify(resBody ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return { spy, calls };
}

export function apiErrorBody(statusCode: number, code: string, message: string, details?: unknown) {
  return {
    statusCode,
    error: code,
    code,
    message,
    details,
    path: '/api/x',
    timestamp: new Date().toISOString(),
  };
}

export function shipmentSummary(overrides: Partial<ShipmentSummary> = {}): ShipmentSummary {
  return {
    id: 'shp_1',
    shipmentNumber: 'CF-2026-00001',
    status: 'BOOKED',
    origin: 'Jakarta (Tanjung Priok)',
    destination: 'Surabaya (Tanjung Perak)',
    estimatedDeliveryAt: '2026-12-01T09:00:00.000Z',
    actualDeliveryAt: null,
    isOverdue: false,
    deliveryPerformance: null,
    customer: { id: 'cus_1', companyName: 'PT Arunika Niaga Sejahtera' },
    container: { id: 'con_1', containerNumber: 'CSQU3054383', containerType: 'DRY_20' },
    createdAt: '2026-11-20T09:00:00.000Z',
    updatedAt: '2026-11-20T09:00:00.000Z',
    ...overrides,
  };
}

export function shipmentDetail(overrides: Partial<ShipmentDetail> = {}): ShipmentDetail {
  const base = shipmentSummary();
  return {
    ...base,
    notes: null,
    customer: {
      ...base.customer,
      contactPerson: 'Rina Wulandari',
      email: 'rina@example.test',
      phone: '+62 21 555 0101',
    },
    createdBy: { id: 'usr_1', fullName: 'Test Operator' },
    allowedTransitions: ['IN_TRANSIT'],
    editableFields: ['estimatedDeliveryAt', 'notes'],
    ...overrides,
  };
}
