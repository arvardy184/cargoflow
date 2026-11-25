import { cn } from '@/lib/utils';

/** Wordmark with a stacked-container glyph. */
export function Brand({ inverted = false, className }: { inverted?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <rect
          x="2"
          y="15"
          width="11"
          height="9"
          rx="1.5"
          className={inverted ? 'fill-white/90' : 'fill-ink'}
        />
        <rect x="15" y="15" width="11" height="9" rx="1.5" className="fill-harbor" />
        <rect
          x="8.5"
          y="4"
          width="11"
          height="9"
          rx="1.5"
          className={inverted ? 'fill-white/60' : 'fill-ink-soft'}
        />
      </svg>
      <span
        className={cn('text-lg font-semibold tracking-tight', inverted ? 'text-white' : 'text-ink')}
      >
        CargoFlow
      </span>
    </span>
  );
}
