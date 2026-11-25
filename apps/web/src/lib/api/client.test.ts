import { describe, expect, it, vi } from 'vitest';
import { apiErrorBody, mockApi } from '@/test/utils';
import { ApiError, apiRequest, toQueryString } from './client';

describe('apiRequest', () => {
  it('calls the same-origin /api proxy with JSON and query parameters', async () => {
    const { calls } = mockApi({ 'POST /shipments': { status: 201, body: { id: 's1' } } });
    const result = await apiRequest<{ id: string }>('/shipments', {
      method: 'POST',
      body: { origin: 'Jakarta' },
      query: { draft: true, skip: undefined, empty: '' },
    });
    expect(result).toEqual({ id: 's1' });
    expect(calls[0].url.pathname).toBe('/api/shipments');
    expect(calls[0].url.search).toBe('?draft=true');
    expect(calls[0].body).toEqual({ origin: 'Jakarta' });
  });

  it('returns undefined for 204 responses', async () => {
    mockApi({ 'POST /auth/logout': { status: 204 } });
    await expect(apiRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('turns API error bodies into ApiError with code, message and field violations', async () => {
    mockApi({
      'POST /shipments': {
        status: 409,
        body: apiErrorBody(
          409,
          'CONTAINER_UNAVAILABLE',
          'Container is already assigned to active shipment CF-2026-00003.',
          [
            {
              field: 'containerId',
              messages: ['container is assigned to another active shipment'],
            },
          ],
        ),
      },
    });
    const error = await apiRequest('/shipments', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'CONTAINER_UNAVAILABLE' });
    expect((error as ApiError).fieldViolations).toEqual([
      { field: 'containerId', messages: ['container is assigned to another active shipment'] },
    ]);
  });

  it('falls back to a readable message when the body is not the API format', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>Bad gateway</html>', { status: 502 }),
    );
    const error = (await apiRequest('/dashboard/summary').catch((e: unknown) => e)) as ApiError;
    expect(error).toMatchObject({ status: 502, code: 'HTTP_502' });
    expect(error.message).toMatch(/server could not complete/i);
  });

  it('reports network failures as NETWORK_ERROR', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const error = (await apiRequest('/health').catch((e: unknown) => e)) as ApiError;
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('ignores non-violation details when listing field violations', () => {
    expect(new ApiError(409, 'X', 'm', { fields: ['companyName'] }).fieldViolations).toEqual([]);
  });
});

describe('toQueryString', () => {
  it('omits empty values and encodes the rest', () => {
    expect(toQueryString({ search: 'CF 1', page: 2, status: undefined, x: null })).toBe(
      '?search=CF+1&page=2',
    );
    expect(toQueryString({})).toBe('');
  });
});
