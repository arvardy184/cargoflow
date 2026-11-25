import Link from 'next/link';
import { Brand } from '@/components/brand';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Brand />
      <h1 className="mt-10 text-2xl font-semibold text-ink">Page not found</h1>
      <p className="mt-2 text-sm text-muted">The address may be mistyped, or the page has moved.</p>
      <Link href="/dashboard" className="mt-6 text-sm font-medium text-harbor hover:underline">
        Go to the dashboard
      </Link>
    </main>
  );
}
