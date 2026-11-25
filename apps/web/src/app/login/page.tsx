import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Brand } from '@/components/brand';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden overflow-hidden bg-ink px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Brand inverted />
        <div className="max-w-md">
          <p className="text-3xl font-semibold leading-tight">
            Every container, from booking to delivery, in one ledger.
          </p>
          <p className="mt-4 text-base leading-relaxed text-white/70">
            Track milestones, catch late shipments before customers do, and keep a full audit trail
            of who changed what.
          </p>
        </div>
        <p className="text-xs text-white/50">Demonstration project with synthetic data.</p>
        {/* Route line motif: ports joined by a voyage line. */}
        <svg
          aria-hidden
          viewBox="0 0 400 120"
          className="pointer-events-none absolute -right-10 top-1/3 w-[28rem] opacity-20"
        >
          <path
            d="M10 90 C 120 10, 260 140, 390 30"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeDasharray="6 8"
          />
          <circle cx="10" cy="90" r="6" fill="white" />
          <circle cx="390" cy="30" r="6" fill="white" />
        </svg>
      </aside>

      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <Brand className="mb-10 lg:hidden" />
          <h1 className="text-2xl font-semibold text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Use your CargoFlow operations account.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
