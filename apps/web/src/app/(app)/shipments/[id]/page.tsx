'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { PageHeader } from '@/components/app-shell';
import { AuditChanges } from '@/components/audit/audit-changes';
import { EditShipmentDialog } from '@/components/shipments/edit-shipment-dialog';
import { EventTimeline } from '@/components/shipments/event-timeline';
import {
  LifecycleRail,
  OverdueBadge,
  PerformanceBadge,
  StatusBadge,
} from '@/components/shipments/status';
import { TransitionControls } from '@/components/shipments/transition-controls';
import { Button } from '@/components/ui/button';
import { Alert, EmptyState, Panel, Skeleton } from '@/components/ui/feedback';
import { isApiError } from '@/lib/api/client';
import { useAuditLogs, useMe, useShipment, useShipmentEvents } from '@/lib/api/hooks';
import type { ShipmentDetail } from '@/lib/api/types';
import {
  AUDIT_ACTION_LABEL,
  CONTAINER_TYPE_LABEL,
  formatDateTime,
  formatRelative,
} from '@/lib/format';

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
    </div>
  );
}

function ShipmentFacts({ s }: { s: ShipmentDetail }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <Panel title="Route and schedule">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Origin">{s.origin}</Detail>
          <Detail label="Destination">{s.destination}</Detail>
          <Detail label="Estimated delivery">
            <span className="tabular">{formatDateTime(s.estimatedDeliveryAt)}</span>
            {s.status !== 'DELIVERED' && (
              <span className="block text-xs text-muted">
                {formatRelative(s.estimatedDeliveryAt)}
              </span>
            )}
          </Detail>
          <Detail label="Delivered">
            {s.actualDeliveryAt ? (
              <>
                <span className="tabular">{formatDateTime(s.actualDeliveryAt)}</span>
                {s.deliveryPerformance && (
                  <span className="mt-0.5 block">
                    <PerformanceBadge performance={s.deliveryPerformance} />
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted">Not yet delivered</span>
            )}
          </Detail>
        </dl>
      </Panel>
      <Panel title="Customer and container">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Customer">{s.customer.companyName}</Detail>
          <Detail label="Contact">
            {s.customer.contactPerson}
            <a href={`mailto:${s.customer.email}`} className="block text-harbor hover:underline">
              {s.customer.email}
            </a>
            <span className="tabular block text-muted">{s.customer.phone}</span>
          </Detail>
          <Detail label="Container">
            <span className="tabular">{s.container.containerNumber}</span>
          </Detail>
          <Detail label="Type">{CONTAINER_TYPE_LABEL[s.container.containerType]}</Detail>
        </dl>
      </Panel>
      <Panel title="Notes" className="md:col-span-2">
        {s.notes ? (
          <p className="whitespace-pre-line text-sm text-ink-soft">{s.notes}</p>
        ) : (
          <p className="text-sm text-muted">No notes.</p>
        )}
      </Panel>
    </div>
  );
}

function ShipmentAudit({ id }: { id: string }) {
  const audit = useAuditLogs({ entityType: 'SHIPMENT', entityId: id, pageSize: 50 });
  return (
    <Panel
      title="Audit trail"
      description="Every recorded change to this shipment, newest first. Visible to administrators."
    >
      {audit.isPending && <Skeleton className="h-24 w-full" />}
      {audit.isError && <Alert>{audit.error.message}</Alert>}
      {audit.data?.data.length === 0 && <p className="text-sm text-muted">No audit records.</p>}
      {audit.data && audit.data.data.length > 0 && (
        <ul className="divide-y divide-line-soft">
          {audit.data.data.map((entry) => (
            <li
              key={entry.id}
              className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[12rem_minmax(0,1fr)]"
            >
              <div>
                <p className="text-sm font-medium text-ink">{AUDIT_ACTION_LABEL[entry.action]}</p>
                <p className="tabular text-xs text-muted">{formatDateTime(entry.createdAt)}</p>
                <p className="text-xs text-muted">{entry.actor.fullName}</p>
              </div>
              <AuditChanges entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ShipmentView() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const me = useMe();
  const shipment = useShipment(id);
  const events = useShipmentEvents(id);

  if (shipment.isPending) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading shipment">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (shipment.isError) {
    const notFound = isApiError(shipment.error) && shipment.error.status === 404;
    return notFound ? (
      <EmptyState
        title="Shipment not found"
        action={
          <Button asChild variant="secondary">
            <Link href="/shipments">Back to shipments</Link>
          </Button>
        }
      >
        It may have been mistyped, or the link is out of date.
      </EmptyState>
    ) : (
      <Alert
        title="The shipment could not be loaded"
        action={
          <Button size="sm" variant="secondary" onClick={() => shipment.refetch()}>
            Retry
          </Button>
        }
      >
        {shipment.error.message}
      </Alert>
    );
  }

  const s = shipment.data;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-muted">
        <Link href="/shipments" className="hover:text-ink hover:underline">
          Shipments
        </Link>
        <span aria-hidden> / </span>
        <span className="tabular text-ink">{s.shipmentNumber}</span>
      </nav>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="tabular">{s.shipmentNumber}</span>
            <StatusBadge status={s.status} />
            {s.isOverdue && <OverdueBadge />}
          </span>
        }
        description={`Created ${formatDateTime(s.createdAt)} by ${s.createdBy.fullName}`}
        actions={<EditShipmentDialog shipment={s} />}
      />

      <div className="space-y-6">
        {params.get('created') && (
          <Alert tone="success" title="Shipment created">
            {s.shipmentNumber} is saved as a draft. Confirm the booking when the carrier accepts it.
          </Alert>
        )}
        {s.isOverdue && (
          <Alert title="This shipment is past its ETA">
            It was due {formatRelative(s.estimatedDeliveryAt)}. Revise the ETA or record the
            delivery.
          </Alert>
        )}

        <Panel title="Lifecycle">
          <div className="mx-auto max-w-2xl py-2">
            <LifecycleRail status={s.status} />
          </div>
          <div className="mt-6 border-t border-line-soft pt-4">
            <TransitionControls shipment={s} />
          </div>
        </Panel>

        <ShipmentFacts s={s} />

        <Panel title="Status history">
          {events.isPending && <Skeleton className="h-24 w-full" />}
          {events.isError && <Alert>{events.error.message}</Alert>}
          {events.data && <EventTimeline events={events.data} />}
        </Panel>

        {me.data?.role === 'ADMIN' && <ShipmentAudit id={s.id} />}
      </div>
    </>
  );
}

export default function ShipmentPage() {
  return (
    <Suspense>
      <ShipmentView />
    </Suspense>
  );
}
