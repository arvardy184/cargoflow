import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageMeta } from '@/lib/api/types';
import { Button } from './button';

export function Pagination({
  meta,
  onPageChange,
  noun,
}: {
  meta: PageMeta;
  onPageChange: (page: number) => void;
  noun: string;
}) {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-4 py-3 text-sm text-muted"
    >
      <p className="tabular">
        {meta.total === 0 ? `No ${noun}` : `${from}–${to} of ${meta.total} ${noun}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(meta.page - 1)}
          disabled={meta.page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft aria-hidden /> Previous
        </Button>
        <span className="tabular px-1">
          Page {meta.page} of {meta.totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(meta.page + 1)}
          disabled={meta.page >= meta.totalPages}
          aria-label="Next page"
        >
          Next <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
