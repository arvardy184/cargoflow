'use client';

import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { ShipmentTable } from '@/components/shipments/shipment-table';
import { Button } from '@/components/ui/button';
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback';
import { Input, Label, Select } from '@/components/ui/form-controls';
import { Pagination } from '@/components/ui/pagination';
import { useShipments, type ShipmentListParams } from '@/lib/api/hooks';
import { SHIPMENT_STATUSES, type ShipmentStatus } from '@/lib/api/types';
import { STATUS_LABEL } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const PAGE_SIZE = 15;

const SORTS = {
  newest: { sortBy: 'createdAt', sortOrder: 'desc', label: 'Newest first' },
  oldest: { sortBy: 'createdAt', sortOrder: 'asc', label: 'Oldest first' },
  'eta-asc': { sortBy: 'estimatedDeliveryAt', sortOrder: 'asc', label: 'ETA, soonest first' },
  'eta-desc': { sortBy: 'estimatedDeliveryAt', sortOrder: 'desc', label: 'ETA, latest first' },
} as const;
type SortKey = keyof typeof SORTS;

function sortKeyOf(sortBy: string | null, sortOrder: string | null): SortKey {
  const match = (Object.keys(SORTS) as SortKey[]).find(
    (k) => SORTS[k].sortBy === sortBy && SORTS[k].sortOrder === sortOrder,
  );
  return match ?? 'newest';
}

/** Filters live in the URL so a filtered view can be bookmarked, shared and survives reloads. */
function ShipmentList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const statusParam = params.get('status');
  const status = SHIPMENT_STATUSES.includes(statusParam as ShipmentStatus)
    ? (statusParam as ShipmentStatus)
    : undefined;
  const overdueParam = params.get('overdue');
  const overdue = overdueParam === 'true' || overdueParam === 'false' ? overdueParam : undefined;
  const sortKey = sortKeyOf(params.get('sortBy'), params.get('sortOrder'));
  const page = Math.max(1, Number(params.get('page')) || 1);
  const urlSearch = params.get('search') ?? '';
  const customerId = params.get('customerId') ?? undefined;

  const [searchInput, setSearchInput] = useState(urlSearch);
  const debouncedSearch = useDebouncedValue(searchInput.trim());

  const update = (changes: Record<string, string | undefined>, resetPage = true) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (resetPage) next.delete('page');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  useEffect(() => {
    if (debouncedSearch !== urlSearch) update({ search: debouncedSearch || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced input
  }, [debouncedSearch]);

  const query: ShipmentListParams = {
    page,
    pageSize: PAGE_SIZE,
    search: urlSearch || undefined,
    status,
    customerId,
    overdue,
    sortBy: SORTS[sortKey].sortBy,
    sortOrder: SORTS[sortKey].sortOrder,
  };
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useShipments(query);
  const hasFilters = Boolean(urlSearch || status || overdue || customerId);
  const customerName = customerId
    ? data?.data.find((s) => s.customer.id === customerId)?.customer.companyName
    : undefined;

  return (
    <>
      <PageHeader
        title="Shipments"
        description={
          data ? `${data.meta.total} ${hasFilters ? 'matching' : 'in total'}` : undefined
        }
        actions={
          <Button asChild>
            <Link href="/shipments/new">
              <Plus aria-hidden /> New shipment
            </Link>
          </Button>
        }
      />

      <section className="rounded-panel border border-line bg-surface">
        <form
          role="search"
          onSubmit={(e) => e.preventDefault()}
          className="grid gap-3 border-b border-line-soft p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="search">Shipment number</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                id="search"
                type="search"
                placeholder="e.g. CF-2026-00012"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
                maxLength={20}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="status">Status</Label>
            <Select
              id="status"
              value={status ?? ''}
              onChange={(e) => update({ status: e.target.value || undefined })}
            >
              <option value="">All statuses</option>
              {SHIPMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="overdue">Schedule</Label>
            <Select
              id="overdue"
              value={overdue ?? ''}
              onChange={(e) => update({ overdue: e.target.value || undefined })}
            >
              <option value="">Any</option>
              <option value="true">Overdue only</option>
              <option value="false">Not overdue</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sort">Sort by</Label>
            <Select
              id="sort"
              value={sortKey}
              onChange={(e) => {
                const s = SORTS[e.target.value as SortKey];
                update({ sortBy: s.sortBy, sortOrder: s.sortOrder });
              }}
            >
              {(Object.keys(SORTS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORTS[k].label}
                </option>
              ))}
            </Select>
          </div>
        </form>

        {customerId && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5 text-sm">
            <span className="text-muted">Customer:</span>
            <span className="font-medium text-ink">{customerName ?? 'Selected customer'}</span>
            <Button
              variant="link"
              className="text-sm"
              onClick={() => update({ customerId: undefined })}
            >
              Show all customers
            </Button>
          </div>
        )}

        {isPending && (
          <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading shipments">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        )}
        {isError && (
          <div className="p-4">
            <Alert
              title="Shipments could not be loaded"
              action={
                <Button size="sm" variant="secondary" onClick={() => refetch()}>
                  Retry
                </Button>
              }
            >
              {error.message}
            </Alert>
          </div>
        )}
        {data &&
          data.data.length === 0 &&
          (hasFilters ? (
            <EmptyState
              title="No shipments match these filters"
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearchInput('');
                    update({
                      search: undefined,
                      status: undefined,
                      overdue: undefined,
                      customerId: undefined,
                    });
                  }}
                >
                  Clear filters
                </Button>
              }
            >
              Try a different shipment number or status.
            </EmptyState>
          ) : (
            <EmptyState
              title="No shipments yet"
              action={
                <Button asChild>
                  <Link href="/shipments/new">Create the first shipment</Link>
                </Button>
              }
            >
              Shipments you create start as drafts until the booking is confirmed.
            </EmptyState>
          ))}
        {data && data.data.length > 0 && (
          <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <ShipmentTable shipments={data.data} />
            <Pagination
              meta={data.meta}
              noun="shipments"
              onPageChange={(p) => update({ page: String(p) }, false)}
            />
          </div>
        )}
      </section>
    </>
  );
}

export default function ShipmentsPage() {
  return (
    <Suspense>
      <ShipmentList />
    </Suspense>
  );
}
