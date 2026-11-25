import Link from 'next/link';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import type { ShipmentSummary } from '@/lib/api/types';
import { CONTAINER_TYPE_LABEL, formatDateTime } from '@/lib/format';
import { OverdueBadge, PerformanceBadge, StatusBadge } from './status';

export function ShipmentTable({ shipments }: { shipments: ShipmentSummary[] }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Shipment</TH>
          <TH>Customer</TH>
          <TH>Route</TH>
          <TH>Container</TH>
          <TH>ETA</TH>
          <TH>Status</TH>
          <TH className="text-right">
            <span className="sr-only">Actions</span>
          </TH>
        </TR>
      </THead>
      <TBody>
        {shipments.map((s) => (
          <TR key={s.id} className="hover:bg-paper/60">
            <TD className="whitespace-nowrap">
              <Link
                href={`/shipments/${s.id}`}
                className="tabular font-medium text-harbor hover:underline"
              >
                {s.shipmentNumber}
              </Link>
            </TD>
            <TD className="max-w-52 truncate" title={s.customer.companyName}>
              {s.customer.companyName}
            </TD>
            <TD className="min-w-48">
              <span className="text-ink">{s.origin}</span>
              <span className="mx-1.5 text-muted" aria-label="to">
                →
              </span>
              <span className="text-ink">{s.destination}</span>
            </TD>
            <TD className="whitespace-nowrap">
              <div className="tabular">{s.container.containerNumber}</div>
              <div className="text-xs text-muted">
                {CONTAINER_TYPE_LABEL[s.container.containerType]}
              </div>
            </TD>
            <TD className="whitespace-nowrap">
              <div className="tabular">{formatDateTime(s.estimatedDeliveryAt)}</div>
              {s.isOverdue && (
                <div className="mt-1">
                  <OverdueBadge />
                </div>
              )}
              {s.deliveryPerformance && (
                <div className="mt-1">
                  <PerformanceBadge performance={s.deliveryPerformance} />
                </div>
              )}
            </TD>
            <TD>
              <StatusBadge status={s.status} />
            </TD>
            <TD className="text-right">
              <Link
                href={`/shipments/${s.id}`}
                className="text-sm font-medium text-harbor hover:underline"
                aria-label={`View shipment ${s.shipmentNumber}`}
              >
                View
              </Link>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
