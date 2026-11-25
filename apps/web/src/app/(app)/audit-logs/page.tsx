'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageHeader, RoleGate } from '@/components/app-shell';
import { AuditChanges } from '@/components/audit/audit-changes';
import { Button } from '@/components/ui/button';
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback';
import { Label, Select } from '@/components/ui/form-controls';
import { Pagination } from '@/components/ui/pagination';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useAuditLogs } from '@/lib/api/hooks';
import type { AuditAction, AuditEntityType, AuditLogEntry } from '@/lib/api/types';
import { AUDIT_ACTION_LABEL, formatDateTime } from '@/lib/format';

const ENTITY_LABEL: Record<AuditEntityType, string> = {
  SHIPMENT: 'Shipment',
  CUSTOMER: 'Customer',
  CONTAINER: 'Container',
};

function EntityCell({ entry }: { entry: AuditLogEntry }) {
  const label = entry.entityLabel ?? entry.entityId;
  return (
    <>
      <div className="text-xs text-muted">{ENTITY_LABEL[entry.entityType]}</div>
      {entry.entityType === 'SHIPMENT' ? (
        <Link
          href={`/shipments/${entry.entityId}`}
          className="tabular font-medium text-harbor hover:underline"
        >
          {label}
        </Link>
      ) : (
        <span className="font-medium text-ink">{label}</span>
      )}
    </>
  );
}

function AuditLogList() {
  const [entityType, setEntityType] = useState<AuditEntityType | ''>('');
  const [action, setAction] = useState<AuditAction | ''>('');
  const [page, setPage] = useState(1);
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useAuditLogs({
    page,
    pageSize: 20,
    entityType: entityType || undefined,
    action: action || undefined,
  });

  return (
    <section className="rounded-panel border border-line bg-surface">
      <div className="grid gap-3 border-b border-line-soft p-4 sm:grid-cols-2 lg:max-w-xl">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entity-type">Record type</Label>
          <Select
            id="entity-type"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value as AuditEntityType | '');
              setPage(1);
            }}
          >
            <option value="">All records</option>
            {(Object.keys(ENTITY_LABEL) as AuditEntityType[]).map((t) => (
              <option key={t} value={t}>
                {ENTITY_LABEL[t]}s
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="action">Action</Label>
          <Select
            id="action"
            value={action}
            onChange={(e) => {
              setAction(e.target.value as AuditAction | '');
              setPage(1);
            }}
          >
            <option value="">All actions</option>
            {(Object.keys(AUDIT_ACTION_LABEL) as AuditAction[]).map((a) => (
              <option key={a} value={a}>
                {AUDIT_ACTION_LABEL[a]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isPending && (
        <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading audit log">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {isError && (
        <div className="p-4">
          <Alert
            title="The audit log could not be loaded"
            action={
              <Button size="sm" variant="secondary" onClick={() => refetch()}>
                Retry
              </Button>
            }
          >
            {error.message}
          </Alert>
        </div>
      )}
      {data && data.data.length === 0 && (
        <EmptyState title="No audit records match these filters" />
      )}
      {data && data.data.length > 0 && (
        <div className={isPlaceholderData ? 'opacity-60' : undefined}>
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Who</TH>
                <TH>Record</TH>
                <TH>Action</TH>
                <TH>Changes</TH>
              </TR>
            </THead>
            <TBody>
              {data.data.map((entry) => (
                <TR key={entry.id} className="align-top">
                  <TD className="tabular whitespace-nowrap">{formatDateTime(entry.createdAt)}</TD>
                  <TD className="whitespace-nowrap">
                    <div>{entry.actor.fullName}</div>
                    <div className="text-xs text-muted">
                      {entry.actor.role === 'ADMIN' ? 'Administrator' : 'Operations'}
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap">
                    <EntityCell entry={entry} />
                  </TD>
                  <TD className="whitespace-nowrap">{AUDIT_ACTION_LABEL[entry.action]}</TD>
                  <TD className="min-w-72">
                    <AuditChanges entry={entry} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination meta={data.meta} noun="records" onPageChange={setPage} />
        </div>
      )}
    </section>
  );
}

export default function AuditLogPage() {
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Who changed what, and when. Records cannot be edited or deleted."
      />
      <RoleGate roles={['ADMIN']}>
        <AuditLogList />
      </RoleGate>
    </>
  );
}
