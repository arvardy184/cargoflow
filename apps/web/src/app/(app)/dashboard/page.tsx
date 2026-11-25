'use client';

import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/app-shell';
import { StatusPipeline } from '@/components/dashboard/status-pipeline';
import { DueSoonBadge, OverdueBadge, StatusBadge } from '@/components/shipments/status';
import { Button } from '@/components/ui/button';
import { Alert, EmptyState, Panel, Skeleton } from '@/components/ui/feedback';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useDashboard } from '@/lib/api/hooks';
import type { DashboardSummary } from '@/lib/api/types';
import { formatDateTime, formatRelative, STATUS_LABEL } from '@/lib/format';
import { cn } from '@/lib/utils';

function Kpi({
  label,
  value,
  detail,
  href,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  href?: string;
  tone?: 'danger';
}) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p
        className={cn(
          'tabular mt-1 text-3xl font-semibold tracking-tight',
          tone === 'danger' ? 'text-danger' : 'text-ink',
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </>
  );
  return href ? (
    <Link href={href} className="block px-5 py-4 transition-colors hover:bg-paper">
      {body}
    </Link>
  ) : (
    <div className="px-5 py-4">{body}</div>
  );
}

/** One strip divided by rules rather than five floating cards: these numbers are read together. */
function KpiStrip({ kpis }: { kpis: DashboardSummary['kpis'] }) {
  const rate = kpis.onTimeDeliveryRate;
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line-soft md:grid-cols-5 [&>*]:bg-surface [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
      <Kpi
        label="Total shipments"
        value={String(kpis.totalShipments)}
        detail={`${kpis.statusBreakdown.DRAFT} still in draft`}
        href="/shipments"
      />
      <Kpi label="Active" value={String(kpis.activeShipments)} detail="Booked or in transit" />
      <Kpi
        label="Delivered"
        value={String(kpis.deliveredShipments)}
        detail="All time"
        href="/shipments?status=DELIVERED"
      />
      <Kpi
        label="Overdue"
        value={String(kpis.overdueShipments)}
        detail={kpis.overdueShipments > 0 ? 'Past ETA, not delivered' : 'Nothing past its ETA'}
        href="/shipments?overdue=true"
        tone={kpis.overdueShipments > 0 ? 'danger' : undefined}
      />
      <Kpi
        label="On-time delivery"
        value={rate === null ? '—' : `${rate}%`}
        detail={
          rate === null
            ? 'No deliveries yet'
            : `${kpis.onTimeDeliveredShipments} of ${kpis.deliveredShipments} delivered by ETA`
        }
      />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-40 w-full" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, isPending, isError, error, refetch, isFetching } = useDashboard();

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={data ? `Updated ${formatDateTime(data.generatedAt)}` : 'Operational overview'}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            loading={isFetching && !isPending}
          >
            {!(isFetching && !isPending) && <RefreshCw aria-hidden />} Refresh
          </Button>
        }
      />

      {isPending && <DashboardSkeleton />}
      {isError && (
        <Alert
          title="The dashboard could not be loaded"
          action={
            <Button size="sm" variant="secondary" onClick={() => refetch()}>
              Retry
            </Button>
          }
        >
          {error.message}
        </Alert>
      )}

      {data && (
        <div className="space-y-6">
          <KpiStrip kpis={data.kpis} />

          <Panel
            title="Pipeline"
            description="Shipments by lifecycle stage. Select a stage to see its shipments."
          >
            <div className="pt-6">
              <StatusPipeline breakdown={data.kpis.statusBreakdown} />
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Panel
              className="lg:col-span-2"
              bodyClassName="p-0"
              title="Needs attention"
              description={`Overdue, or due within ${data.attention.dueSoonWindowHours} hours and not yet delivered.`}
              actions={
                data.attention.total > data.attention.shipments.length ? (
                  <Link
                    href="/shipments?sortBy=estimatedDeliveryAt&sortOrder=asc"
                    className="text-sm font-medium text-harbor hover:underline"
                  >
                    View all {data.attention.total}
                  </Link>
                ) : undefined
              }
            >
              {data.attention.shipments.length === 0 ? (
                <EmptyState title="Nothing needs attention">
                  No undelivered shipment is overdue or due in the next{' '}
                  {data.attention.dueSoonWindowHours} hours.
                </EmptyState>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Shipment</TH>
                      <TH>Customer</TH>
                      <TH>ETA</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.attention.shipments.map((s) => (
                      <TR key={s.id}>
                        <TD>
                          <Link
                            href={`/shipments/${s.id}`}
                            className="tabular whitespace-nowrap font-medium text-harbor hover:underline"
                          >
                            {s.shipmentNumber}
                          </Link>
                          <div className="mt-0.5 min-w-40 text-xs text-muted">
                            {s.origin} → {s.destination}
                          </div>
                        </TD>
                        <TD className="max-w-48 truncate">{s.customer.companyName}</TD>
                        <TD className="whitespace-nowrap">
                          <div className="tabular">{formatDateTime(s.estimatedDeliveryAt)}</div>
                          <div className="mt-1 flex items-center gap-2">
                            {s.attentionReason === 'OVERDUE' ? <OverdueBadge /> : <DueSoonBadge />}
                            <span className="text-xs text-muted">
                              {formatRelative(s.estimatedDeliveryAt)}
                            </span>
                          </div>
                        </TD>
                        <TD>
                          <StatusBadge status={s.status} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </Panel>

            <Panel title="Recent activity" bodyClassName="py-2">
              {data.recentActivity.length === 0 ? (
                <EmptyState title="No activity yet">Status changes will appear here.</EmptyState>
              ) : (
                <ul className="divide-y divide-line-soft">
                  {data.recentActivity.map((event) => (
                    <li key={event.id} className="py-3 text-sm">
                      <p className="text-ink">
                        <Link
                          href={`/shipments/${event.shipment.id}`}
                          className="tabular font-medium text-harbor hover:underline"
                        >
                          {event.shipment.shipmentNumber}
                        </Link>{' '}
                        {event.previousStatus ? (
                          <>moved to {STATUS_LABEL[event.newStatus].toLowerCase()}</>
                        ) : (
                          <>was created</>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {event.changedBy.fullName}, {formatRelative(event.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
