'use client';

import Link from 'next/link';
import { useState } from 'react';
import { STATUS_STYLE } from '@/components/shipments/status';
import type { ShipmentStatus } from '@/lib/api/types';
import { SHIPMENT_STATUSES } from '@/lib/api/types';
import { STATUS_LABEL } from '@/lib/format';
import { cn } from '@/lib/utils';

function percent(count: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((count / total) * 100)}%`;
}

/**
 * Part-to-whole bar of shipments per lifecycle stage. Segments are separated by a 2px surface
 * gap, show a tooltip on hover/focus and link to the filtered shipment list. The legend lists
 * every count, so the chart is never colour-only and doubles as its table view.
 */
export function StatusPipeline({ breakdown }: { breakdown: Record<ShipmentStatus, number> }) {
  const total = SHIPMENT_STATUSES.reduce((sum, s) => sum + breakdown[s], 0);
  const [active, setActive] = useState<ShipmentStatus | null>(null);
  const segments = SHIPMENT_STATUSES.filter((s) => breakdown[s] > 0);

  return (
    <div>
      <div className="relative">
        {total === 0 ? (
          <div className="h-4 rounded bg-line-soft" aria-hidden />
        ) : (
          <div className="flex h-4 gap-0.5" role="list" aria-label="Shipments by status">
            {segments.map((status) => (
              <Link
                key={status}
                role="listitem"
                href={`/shipments?status=${status}`}
                aria-label={`${STATUS_LABEL[status]}: ${breakdown[status]} shipments (${percent(breakdown[status], total)}). Show list.`}
                onMouseEnter={() => setActive(status)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(status)}
                onBlur={() => setActive(null)}
                className={cn(
                  'min-w-1.5 first:rounded-l last:rounded-r transition-opacity',
                  STATUS_STYLE[status].bar,
                  active && active !== status && 'opacity-40',
                )}
                style={{ flexGrow: breakdown[status], flexBasis: 0 }}
              />
            ))}
          </div>
        )}
        {active && (
          <div
            role="tooltip"
            className="tabular pointer-events-none absolute -top-10 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-control bg-ink px-2.5 py-1.5 text-xs text-white shadow"
          >
            {STATUS_LABEL[active]}: {breakdown[active]} ({percent(breakdown[active], total)})
          </div>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {SHIPMENT_STATUSES.map((status) => (
          <div key={status} className="flex items-start gap-2">
            <span
              className={cn('mt-1.5 size-2.5 shrink-0 rounded-sm', STATUS_STYLE[status].bar)}
              aria-hidden
            />
            <div>
              <dt className="text-sm text-muted">{STATUS_LABEL[status]}</dt>
              <dd className="tabular text-lg font-semibold text-ink">
                {breakdown[status]}
                <span className="ml-1.5 text-xs font-normal text-muted">
                  {percent(breakdown[status], total)}
                </span>
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}
