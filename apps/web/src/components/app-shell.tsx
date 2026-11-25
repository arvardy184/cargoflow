'use client';

import { Boxes, ClipboardList, LayoutDashboard, LogOut, Menu, Ship, Users, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Alert, Skeleton } from '@/components/ui/feedback';
import { useLogout, useMe } from '@/lib/api/hooks';
import type { Role, User } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/shipments', label: 'Shipments', icon: Ship },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/containers', label: 'Containers', icon: Boxes },
  { href: '/audit-logs', label: 'Audit log', icon: ClipboardList, roles: ['ADMIN'] },
];

export function visibleNav(role: Role): NavItem[] {
  return NAV.filter((item) => !item.roles || item.roles.includes(role));
}

const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Administrator', OPERATIONS: 'Operations' };

function NavLinks({ user, onNavigate }: { user: User; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {visibleNav(user.role).map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-white/12 text-white'
                  : 'text-white/70 hover:bg-white/6 hover:text-white',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function UserBlock({ user }: { user: User }) {
  const router = useRouter();
  const logout = useLogout();
  return (
    <div className="border-t border-white/10 pt-4">
      <p className="truncate text-sm font-medium text-white">{user.fullName}</p>
      <p className="truncate text-xs text-white/60">{ROLE_LABEL[user.role]}</p>
      <Button
        variant="ghost"
        size="sm"
        className="mt-3 -ml-2 text-white/70 hover:bg-white/6 hover:text-white"
        loading={logout.isPending}
        onClick={() => logout.mutate(undefined, { onSettled: () => router.replace('/login') })}
      >
        <LogOut aria-hidden /> Sign out
      </Button>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const [menuOpen, setMenuOpen] = useState(false);

  if (me.isPending) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-60 bg-ink lg:block" />
        <div className="flex-1 space-y-4 p-8">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (me.isError) {
    // 401s are redirected globally; anything else (e.g. API down) is shown here.
    return (
      <div className="mx-auto max-w-lg p-8">
        <Alert
          title="CargoFlow is unavailable"
          action={
            <Button size="sm" variant="secondary" onClick={() => me.refetch()}>
              Retry
            </Button>
          }
        >
          {me.error.message}
        </Alert>
      </div>
    );
  }

  const user = me.data;
  return (
    <div className="min-h-screen lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-ink px-4 py-6 lg:flex">
        <Link href="/dashboard" className="mb-8 px-2">
          <Brand inverted />
        </Link>
        <nav aria-label="Main" className="flex-1">
          <NavLinks user={user} />
        </nav>
        <UserBlock user={user} />
      </aside>

      {/* Mobile / tablet top bar */}
      <header className="sticky top-0 z-30 bg-ink px-4 py-3 lg:hidden">
        <div className="flex items-center justify-between">
          <Link href="/dashboard">
            <Brand inverted />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10 hover:text-white"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden /> : <Menu aria-hidden />}
          </Button>
        </div>
        {menuOpen && (
          <nav id="mobile-nav" aria-label="Main" className="mt-3 space-y-4 pb-2">
            <NavLinks user={user} onNavigate={() => setMenuOpen(false)} />
            <UserBlock user={user} />
          </nav>
        )}
      </header>

      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-[1200px]">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <div className="mt-1 text-sm text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Renders children only for the given roles; otherwise explains why the page is unavailable. */
export function RoleGate({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const me = useMe();
  if (!me.data) return null;
  if (!roles.includes(me.data.role)) {
    return (
      <Alert title="Administrators only">
        This page is available to administrators. Ask an administrator if you need this information.
      </Alert>
    );
  }
  return <>{children}</>;
}
