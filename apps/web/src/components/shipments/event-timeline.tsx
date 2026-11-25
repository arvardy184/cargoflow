import type { ShipmentEvent } from '@/lib/api/types';
import { formatDateTime, STATUS_LABEL } from '@/lib/format';
import { cn } from '@/lib/utils';
import { STATUS_STYLE } from './status';

/** Status history, oldest first, as a vertical line of milestones. */
export function EventTimeline({ events }: { events: ShipmentEvent[] }) {
  return (
    <ol className="relative">
      {events.map((event, index) => (
        <li key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
          {index < events.length - 1 && (
            <span aria-hidden className="absolute left-[7px] top-4 h-full w-0.5 bg-line" />
          )}
          <span
            aria-hidden
            className={cn(
              'relative z-10 mt-1 size-4 shrink-0 rounded-full ring-4 ring-surface',
              STATUS_STYLE[event.newStatus].dot,
            )}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">
              {event.previousStatus
                ? `${STATUS_LABEL[event.previousStatus]} → ${STATUS_LABEL[event.newStatus]}`
                : `Created as ${STATUS_LABEL[event.newStatus].toLowerCase()}`}
            </p>
            <p className="tabular mt-0.5 text-xs text-muted">
              <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>, by{' '}
              {event.changedBy.fullName}
            </p>
            {event.remarks && <p className="mt-1.5 text-sm text-ink-soft">{event.remarks}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
