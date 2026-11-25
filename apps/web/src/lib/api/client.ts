import type { FieldViolation } from './types';

/** Error body produced by the API's global exception filter. */
interface ApiErrorBody {
  statusCode?: number;
  code?: string;
  message?: string;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level violations, when the API returned them (validation and some domain errors). */
  get fieldViolations(): FieldViolation[] {
    if (!Array.isArray(this.details)) return [];
    return this.details.filter(
      (d): d is FieldViolation =>
        typeof d === 'object' && d !== null && typeof (d as FieldViolation).field === 'string',
    );
  }

  static fromResponse(status: number, body: unknown): ApiError {
    const b = (typeof body === 'object' && body !== null ? body : {}) as ApiErrorBody;
    return new ApiError(
      status,
      b.code ?? `HTTP_${status}`,
      b.message ?? fallbackMessage(status),
      b.details,
    );
  }
}

function fallbackMessage(status: number): string {
  if (status === 401) return 'Your session has ended. Sign in again.';
  if (status === 403) return 'You do not have permission to do this.';
  if (status === 404) return 'This record could not be found.';
  if (status >= 500) return 'The server could not complete the request. Try again shortly.';
  return 'The request could not be completed.';
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function toQueryString(query: Query = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

/**
 * Same-origin call to `/api/*` (proxied to the NestJS API by Next.js). The httpOnly session
 * cookie travels automatically; the token is never readable from JavaScript.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = options;
  let response: Response;
  try {
    response = await fetch(`/api${path}${toQueryString(query)}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Cannot reach the CargoFlow server. Check your connection and try again.',
    );
  }

  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw ApiError.fromResponse(response.status, payload);
  return payload as T;
}
