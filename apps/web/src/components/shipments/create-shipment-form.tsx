'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls';
import { useContainers, useCreateShipment, useCustomers } from '@/lib/api/hooks';
import { applyApiErrors } from '@/lib/form-errors';
import { CONTAINER_TYPE_LABEL, localInputToIso } from '@/lib/format';
import { createShipmentSchema, type CreateShipmentValues } from '@/lib/schemas';

const FIELDS = [
  'customerId',
  'containerId',
  'origin',
  'destination',
  'estimatedDeliveryAt',
  'notes',
] as const;

/** Common Indonesian ports, offered as suggestions; any location can be typed. */
const PORT_SUGGESTIONS = [
  'Jakarta (Tanjung Priok)',
  'Surabaya (Tanjung Perak)',
  'Medan (Belawan)',
  'Makassar (Soekarno-Hatta)',
  'Semarang (Tanjung Emas)',
  'Balikpapan (Semayang)',
  'Pontianak (Dwikora)',
  'Banjarmasin (Trisakti)',
  'Batam (Batu Ampar)',
  'Bitung',
  'Sorong',
  'Padang (Teluk Bayur)',
];

export function CreateShipmentForm() {
  const router = useRouter();
  const customers = useCustomers({ pageSize: 100 });
  const containers = useContainers({ pageSize: 100, available: 'true' });
  const create = useCreateShipment();
  const [formError, setFormError] = useState<string>();
  const [schema] = useState(() => createShipmentSchema());

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateShipmentValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerId: '',
      containerId: '',
      origin: '',
      destination: '',
      estimatedDeliveryAt: '',
      notes: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      const shipment = await create.mutateAsync({
        customerId: values.customerId,
        containerId: values.containerId,
        origin: values.origin,
        destination: values.destination,
        estimatedDeliveryAt: localInputToIso(values.estimatedDeliveryAt),
        ...(values.notes ? { notes: values.notes } : {}),
      });
      router.push(`/shipments/${shipment.id}?created=1`);
    } catch (error) {
      setFormError(applyApiErrors(error, setError, FIELDS));
    }
  });

  const lookupsFailed = customers.isError || containers.isError;
  const noContainers = containers.data?.data.length === 0;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {formError && <Alert title="The shipment was not created">{formError}</Alert>}
      {lookupsFailed && (
        <Alert title="Customers or containers could not be loaded">
          Reload the page to try again.
        </Alert>
      )}

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-4 text-sm font-semibold text-ink">Customer and equipment</legend>
        <Field id="customerId" label="Customer" error={errors.customerId?.message}>
          {(aria) => (
            <Select {...aria} {...register('customerId')} disabled={customers.isPending}>
              <option value="">
                {customers.isPending ? 'Loading customers…' : 'Select a customer'}
              </option>
              {customers.data?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          id="containerId"
          label="Container"
          error={errors.containerId?.message}
          hint={
            noContainers ? undefined : 'Only containers not on another active shipment are listed.'
          }
        >
          {(aria) => (
            <Select {...aria} {...register('containerId')} disabled={containers.isPending}>
              <option value="">
                {containers.isPending
                  ? 'Loading containers…'
                  : noContainers
                    ? 'No containers available'
                    : 'Select a container'}
              </option>
              {containers.data?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.containerNumber} ({CONTAINER_TYPE_LABEL[c.containerType]})
                </option>
              ))}
            </Select>
          )}
        </Field>
        {noContainers && (
          <p className="text-sm text-muted sm:col-span-2">
            Every container is on an active shipment.{' '}
            <Link href="/containers" className="font-medium text-harbor hover:underline">
              Register a container
            </Link>{' '}
            to continue.
          </p>
        )}
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-4 text-sm font-semibold text-ink">Route and schedule</legend>
        <Field id="origin" label="Origin" error={errors.origin?.message}>
          {(aria) => <Input list="ports" autoComplete="off" {...aria} {...register('origin')} />}
        </Field>
        <Field id="destination" label="Destination" error={errors.destination?.message}>
          {(aria) => (
            <Input list="ports" autoComplete="off" {...aria} {...register('destination')} />
          )}
        </Field>
        <datalist id="ports">
          {PORT_SUGGESTIONS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <Field
          id="estimatedDeliveryAt"
          label="Estimated delivery (ETA)"
          error={errors.estimatedDeliveryAt?.message}
          hint="Your local time. Must be in the future."
        >
          {(aria) => <Input type="datetime-local" {...aria} {...register('estimatedDeliveryAt')} />}
        </Field>
      </fieldset>

      <Field id="notes" label="Notes" optional error={errors.notes?.message}>
        {(aria) => <Textarea rows={3} maxLength={1000} {...aria} {...register('notes')} />}
      </Field>

      <div className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-5">
        <Button type="submit" loading={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create shipment'}
        </Button>
        <Button asChild variant="secondary">
          <Link href="/shipments">Cancel</Link>
        </Button>
        <p className="text-sm text-muted">New shipments start as drafts.</p>
      </div>
    </form>
  );
}
