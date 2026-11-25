'use client';

import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog';
import { Button } from '@/components/ui/button';
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback';
import { Input, Label } from '@/components/ui/form-controls';
import { Pagination } from '@/components/ui/pagination';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useCustomers, useMe } from '@/lib/api/hooks';
import type { Customer } from '@/lib/api/types';
import { useDebouncedValue } from '@/lib/use-debounced-value';

export default function CustomersPage() {
  const me = useMe();
  const isAdmin = me.data?.role === 'ADMIN';
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput.trim());
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ open: boolean; customer?: Customer }>({ open: false });
  const [saved, setSaved] = useState<string>();

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useCustomers({
    page,
    pageSize: 15,
    search: search || undefined,
  });

  return (
    <>
      <PageHeader
        title="Customers"
        description={
          isAdmin
            ? 'Shippers you move containers for.'
            : 'Shippers you move containers for. Only administrators can add or edit customers.'
        }
        actions={
          isAdmin && (
            <Button onClick={() => setDialog({ open: true })}>
              <Plus aria-hidden /> Add customer
            </Button>
          )
        }
      />

      {saved && (
        <Alert tone="success" className="mb-4">
          {saved}
        </Alert>
      )}

      <section className="rounded-panel border border-line bg-surface">
        <div className="border-b border-line-soft p-4">
          <div className="flex max-w-md flex-col gap-1.5">
            <Label htmlFor="customer-search">Search</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                id="customer-search"
                type="search"
                placeholder="Company, contact or email"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
          </div>
        </div>

        {isPending && (
          <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading customers">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        )}
        {isError && (
          <div className="p-4">
            <Alert
              title="Customers could not be loaded"
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
            title={search ? 'No customers match this search' : 'No customers yet'}
            action={
              !search && isAdmin ? (
                <Button onClick={() => setDialog({ open: true })}>Add the first customer</Button>
              ) : undefined
            }
          >
            {search ? 'Check the spelling or search by contact email.' : undefined}
          </EmptyState>
        )}
        {data && data.data.length > 0 && (
          <div className={isPlaceholderData ? 'opacity-60' : undefined}>
            <Table>
              <THead>
                <TR>
                  <TH>Company</TH>
                  <TH>Contact</TH>
                  <TH>Phone</TH>
                  <TH className="text-right">Shipments</TH>
                  {isAdmin && (
                    <TH className="text-right">
                      <span className="sr-only">Actions</span>
                    </TH>
                  )}
                </TR>
              </THead>
              <TBody>
                {data.data.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium text-ink">{c.companyName}</TD>
                    <TD>
                      <div>{c.contactPerson}</div>
                      <a href={`mailto:${c.email}`} className="text-xs text-harbor hover:underline">
                        {c.email}
                      </a>
                    </TD>
                    <TD className="tabular whitespace-nowrap">{c.phone}</TD>
                    <TD className="tabular text-right">
                      {c.shipmentCount > 0 ? (
                        <Link
                          href={`/shipments?customerId=${c.id}`}
                          className="text-harbor hover:underline"
                        >
                          {c.shipmentCount}
                        </Link>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </TD>
                    {isAdmin && (
                      <TD className="text-right">
                        <Button
                          variant="link"
                          onClick={() => setDialog({ open: true, customer: c })}
                          aria-label={`Edit ${c.companyName}`}
                        >
                          Edit
                        </Button>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={data.meta} noun="customers" onPageChange={setPage} />
          </div>
        )}
      </section>

      <CustomerFormDialog
        open={dialog.open}
        customer={dialog.customer}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        onSaved={(customer) =>
          setSaved(
            dialog.customer ? `${customer.companyName} updated.` : `${customer.companyName} added.`,
          )
        }
      />
    </>
  );
}
