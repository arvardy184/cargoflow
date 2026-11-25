import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

const tones = {
  error: { box: 'border-danger/30 bg-danger-tint text-danger', Icon: AlertCircle },
  success: {
    box: 'border-status-delivered/30 bg-success-tint text-status-delivered',
    Icon: CheckCircle2,
  },
  info: { box: 'border-harbor/25 bg-harbor-tint text-harbor-dark', Icon: Info },
} as const;

export function Alert({
  tone = 'error',
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof tones;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const { box, Icon } = tones[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-panel border px-4 py-3 text-sm',
        box,
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'text-ink-soft')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('animate-pulse rounded-control bg-line-soft', className)} />
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      {children && <p className="mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    // min-w-0: as a grid/flex child, let wide content (tables) scroll inside instead of
    // stretching the track past the viewport.
    <section className={cn('min-w-0 rounded-panel border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn('px-5 py-4', bodyClassName)}>{children}</div>
    </section>
  );
}
