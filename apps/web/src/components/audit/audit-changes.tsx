import type { AuditLogEntry } from '@/lib/api/types';
import { FIELD_LABEL, formatAuditValue } from '@/lib/format';

const FIELD_ORDER = Object.keys(FIELD_LABEL);
const fieldRank = (field: string) => {
  const index = FIELD_ORDER.indexOf(field);
  return index === -1 ? FIELD_ORDER.length : index;
};

/** Field-by-field before → after view of one audit record. */
export function AuditChanges({
  entry,
}: {
  entry: Pick<AuditLogEntry, 'action' | 'beforeData' | 'afterData'>;
}) {
  const before = entry.beforeData ?? {};
  const after = entry.afterData ?? {};
  // MySQL's JSON type does not preserve key order, so present fields in a fixed, readable order.
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort(
    (a, b) => fieldRank(a) - fieldRank(b),
  );
  if (fields.length === 0) return <span className="text-muted">No field data</span>;

  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
      {fields.map((field) => (
        <div key={field} className="contents">
          <dt className="text-muted">{FIELD_LABEL[field] ?? field}</dt>
          <dd className="min-w-0 break-words text-ink">
            {/* Values only recorded after the change (creation, transition remarks) have no "before". */}
            {entry.action === 'CREATE' || !(field in before) ? (
              formatAuditValue(field, after[field])
            ) : (
              <>
                <span className="text-muted line-through decoration-muted/50">
                  {formatAuditValue(field, before[field])}
                </span>
                <span className="mx-1.5 text-muted" aria-label="changed to">
                  →
                </span>
                {formatAuditValue(field, after[field])}
              </>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
