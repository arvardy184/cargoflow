import { AlertTriangle, Check, Clock } from 'lucide-react';
import type { DeliveryPerformance, ShipmentStatus } from '@/lib/api/types';
import { SHIPMENT_STATUSES } from '@/lib/api/types';
import { STATUS_LABEL } from '@/lib/format';
import { cn } from '@/lib/utils';

export const STATUS_STYLE: Record<ShipmentStatus, { badge: string; dot: string; bar: string }> = {
  DRAFT: {
    badge: 'bg-slate-100 text-slate-700 ring-slate-300',
    dot: 'bg-status-draft',
    bar: 'bg-status-draft',
  },
  BOOKED: {
    badge: 'bg-harbor-tint text-harbor-dark ring-harbor/30',
    dot: 'bg-status-booked',
    bar: 'bg-status-booked',
  },
  IN_TRANSIT: {
    badge: 'bg-cyan-50 text-status-transit-ink ring-status-transit/30',
    dot: 'bg-status-transit',
    bar: 'bg-status-transit',
  },
  DELIVERED: {
    badge: 'bg-success-tint text-status-delivered ring-status-delivered/30',
    dot: 'bg-status-delivered',
    bar: 'bg-status-delivered',
  },
};

export function StatusBadge({ status, className }: { status: ShipmentStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        STATUS_STYLE[status].badge,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', STATUS_STYLE[status].dot)} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function OverdueBadge() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-danger-tint px-2 py-0.5 text-xs font-medium text-danger ring-1 ring-inset ring-danger/25">
      <AlertTriangle className="size-3" aria-hidden />
      Overdue
    </span>
  );
}

export function DueSoonBadge() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-warning-tint px-2 py-0.5 text-xs font-medium text-warning ring-1 ring-inset ring-warning/25">
      <Clock className="size-3" aria-hidden />
      Due soon
    </span>
  );
}

export function PerformanceBadge({ performance }: { performance: DeliveryPerformance }) {
  return performance === 'ON_TIME' ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-status-delivered">
      <Check className="size-3" aria-hidden /> On time
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
      <Clock className="size-3" aria-hidden /> Late
    </span>
  );
}

/**
 * The lifecycle rail: the four stages as a voyage line. Completed stages are filled, the current
 * stage is ringed, upcoming stages are hollow. This is a true sequence, hence the step numbers.
 */
export function LifecycleRail({ status }: { status: ShipmentStatus }) {
  const currentIndex = SHIPMENT_STATUSES.indexOf(status);
  return (
    <ol className="grid grid-cols-4" aria-label="Shipment lifecycle">
      {SHIPMENT_STATUSES.map((stage, index) => {
        const done = index < currentIndex || status === 'DELIVERED';
        const current = index === currentIndex;
        return (
          <li
            key={stage}
            className="relative flex flex-col items-center text-center"
            aria-current={current ? 'step' : undefined}
          >
            {index > 0 && (
              <span
                aria-hidden
                className={cn(
                  'absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2',
                  index <= currentIndex ? STATUS_STYLE[stage].bar : 'bg-line',
                )}
              />
            )}
            <span
              className={cn(
                'tabular relative z-10 flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold',
                done || current
                  ? cn(STATUS_STYLE[stage].bar, 'border-transparent text-white')
                  : 'border-line bg-surface text-muted',
                current && status !== 'DELIVERED' && 'ring-4 ring-harbor/15',
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : index + 1}
            </span>
            <span
              className={cn(
                'mt-2 text-xs sm:text-sm',
                current ? 'font-semibold text-ink' : 'text-muted',
              )}
            >
              {STATUS_LABEL[stage]}
            </span>
            <span className="sr-only">
              {done ? '(completed)' : current ? '(current)' : '(upcoming)'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
