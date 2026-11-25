'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { isApiError } from '@/lib/api/client';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { skipAuthRedirect?: boolean };
  }
}

let redirecting = false;

/**
 * Any 401 from the API means the session cookie is missing, expired or invalid. Clear it (so the
 * route guard does not bounce us back) and send the user to sign in, returning here afterwards.
 */
function handleUnauthenticated() {
  if (redirecting || typeof window === 'undefined') return;
  redirecting = true;
  const next = `${window.location.pathname}${window.location.search}`;
  void fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).finally(() => {
    // Deliberate full navigation: runs outside React (no router here) and discards every cached
    // query from the ended session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?next=${encodeURIComponent(next)}&reason=expired`);
  });
}

export function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (isApiError(error) && error.status === 401) handleUnauthenticated();
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        if (isApiError(error) && error.status === 401 && !mutation.meta?.skipAuthRedirect) {
          handleUnauthenticated();
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        // Client errors (4xx) will not fix themselves; only retry network/server failures.
        retry: (failureCount, error) =>
          !(isApiError(error) && error.status >= 400 && error.status < 500) && failureCount < 2,
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
