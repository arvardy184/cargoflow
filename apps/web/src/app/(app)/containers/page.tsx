'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { PageHeader } from '@/components/app-shell';
import { StatusBadge } from '@/components/shipments/status';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback';
import { Field, Input, Label, Select } from '@/components/ui/form-controls';
import { Pagination } from '@/components/ui/pagination';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useContainers, useCreateContainer } from '@/lib/api/hooks';
import { CONTAINER_TYPES, type Container } from '@/lib/api/types';
import { applyApiErrors } from '@/lib/form-errors';
import { CONTAINER_TYPE_LABEL } from '@/lib/format';
import { containerSchema, type ContainerValues } from '@/lib/schemas';
import { useDebouncedValue } from '@/lib/use-debounced-value';

function RegisterContainerForm({
  onSaved,
  onCancel,
}: {
  onSaved: (c: Container) => void;
  onCancel: () => void;
}) {
  const create = useCreateContainer();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ContainerValues>({
    resolver: zodResolver(containerSchema),
    defaultValues: { containerNumber: '', containerType: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      // The API normalises spacing/case and verifies the ISO 6346 check digit.
      onSaved(await create.mutateAsync(values));
    } catch (error) {
      setFormError(applyApiErrors(error, setError, ['containerNumber', 'containerType']));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError && <Alert title="The container was not registered">{formError}</Alert>}
      <Field
        id="containerNumber"
        label="Container number"
        error={errors.containerNumber?.message}
        hint="ISO 6346: owner code, category letter, 6-digit serial and check digit."
      >
        {(aria) => (
          <Input
            placeholder="CSQU3054383"
            autoComplete="off"
            className="uppercase"
            {...aria}
            {...register('containerNumber')}
          />
        )}
      </Field>
      <Field id="containerType" label="Type" error={errors.containerType?.message}>
        {(aria) => (
          <Select {...aria} {...register('containerType')}>
            <option value="">Select a type</option>
            {CONTAINER_TYPES.map((t) => (
              <option key={t} value={t}>
                {CONTAINER_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Register container
        </Button>
      </div>
    </form>
  );
}

export default function ContainersPage() {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput.trim());
  const [available, setAvailable] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<string>();

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useContainers({
    page,
    pageSize: 15,
    search: search || undefined,
    available: available || undefined,
  });

  return (
    <>
      <PageHeader
        title="Containers"
        description="Equipment that can be assigned to shipments. A container serves one active shipment at a time."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus aria-hidden /> Register container
          </Button>
        }
      />
      {saved && (
        <Alert tone="success" className="mb-4">
          {saved}
        </Alert>
      )}

      <section className="rounded-panel border border-line bg-surface">
        <div className="grid gap-3 border-b border-line-soft p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:max-w-2xl">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="container-search">Container number</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                id="container-search"
                type="search"
                className="pl-9"
                placeholder="e.g. CSQU"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="availability">Availability</Label>
            <Select
              id="availability"
              value={available}
              onChange={(e) => {
                setAvailable(e.target.value as typeof available);
                setPage(1);
              }}
            >
              <option value="">All containers</option>
              <option value="true">Available</option>
              <option value="false">In use</option>
            </Select>
          </div>
        </div>

        {isPending && (
          <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading containers">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        )}
        {isError && (
          <div className="p-4">
            <Alert
              title="Containers could not be loaded"
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
          <EmptyState
            title={
              search || available ? 'No containers match these filters' : 'No containers registered'
            }
          />
        )}
        {data && data.data.length > 0 && (
          <div className={isPlaceholderData ? 'opacity-60' : undefined}>
            <Table>
              <THead>
                <TR>
                  <TH>Container</TH>
                  <TH>Type</TH>
                  <TH>Assignment</TH>
                </TR>
              </THead>
              <TBody>
                {data.data.map((c) => (
                  <TR key={c.id}>
                    <TD className="tabular font-medium text-ink">{c.containerNumber}</TD>
                    <TD>{CONTAINER_TYPE_LABEL[c.containerType]}</TD>
                    <TD>
                      {c.activeShipment ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/shipments/${c.activeShipment.id}`}
                            className="tabular text-harbor hover:underline"
                          >
                            {c.activeShipment.shipmentNumber}
                          </Link>
                          <StatusBadge status={c.activeShipment.status} />
                        </span>
                      ) : (
                        <span className="text-status-delivered">Available</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={data.meta} noun="containers" onPageChange={setPage} />
          </div>
        )}
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Register container">
          {open && (
            <RegisterContainerForm
              onCancel={() => setOpen(false)}
              onSaved={(c) => {
                setOpen(false);
                setSaved(`Container ${c.containerNumber} registered.`);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
