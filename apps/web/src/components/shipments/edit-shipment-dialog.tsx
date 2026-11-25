'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls';
import { useContainers, useCustomers, useUpdateShipment } from '@/lib/api/hooks';
import type { EditableShipmentField, ShipmentDetail } from '@/lib/api/types';
import { applyApiErrors } from '@/lib/form-errors';
import { CONTAINER_TYPE_LABEL, localInputToIso, toLocalInputValue } from '@/lib/format';
import { editShipmentSchema, type EditShipmentValues } from '@/lib/schemas';

function initialValues(s: ShipmentDetail): Required<EditShipmentValues> {
  return {
    customerId: s.customer.id,
    containerId: s.container.id,
    origin: s.origin,
    destination: s.destination,
    estimatedDeliveryAt: toLocalInputValue(s.estimatedDeliveryAt),
    notes: s.notes ?? '',
  };
}

/** Shows only the fields the API reports as editable for this user and status. */
function EditForm({ shipment, onDone }: { shipment: ShipmentDetail; onDone: () => void }) {
  const editable = new Set<EditableShipmentField>(shipment.editableFields);
  const update = useUpdateShipment(shipment.id);
  const customers = useCustomers({ pageSize: 100 });
  const containers = useContainers({ pageSize: 100, available: 'true' });
  const [formError, setFormError] = useState<string>();
  const [schema] = useState(() => editShipmentSchema());
  const defaults = initialValues(shipment);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, dirtyFields, isSubmitting },
  } = useForm<EditShipmentValues>({ resolver: zodResolver(schema), defaultValues: defaults });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    const changed = shipment.editableFields.filter((f) => dirtyFields[f]);
    if (changed.length === 0) {
      onDone();
      return;
    }
    const body: Record<string, string | null> = {};
    for (const field of changed) {
      const value = values[field] ?? '';
      if (field === 'estimatedDeliveryAt') body[field] = localInputToIso(value);
      else if (field === 'notes') body[field] = value.trim() === '' ? null : value;
      else body[field] = value;
    }
    try {
      await update.mutateAsync(body);
      onDone();
    } catch (error) {
      setFormError(applyApiErrors(error, setError, shipment.editableFields));
    }
  });

  // The current container is not "available" (it is assigned to this shipment), so add it.
  const containerOptions = [
    {
      id: shipment.container.id,
      containerNumber: shipment.container.containerNumber,
      containerType: shipment.container.containerType,
    },
    ...(containers.data?.data ?? []).filter((c) => c.id !== shipment.container.id),
  ];

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError && <Alert title="Changes were not saved">{formError}</Alert>}
      {shipment.status !== 'DRAFT' && (
        <Alert tone="info">Once booked, only the ETA and notes can be changed.</Alert>
      )}

      {editable.has('customerId') && (
        <Field id="edit-customerId" label="Customer" error={errors.customerId?.message}>
          {(aria) => (
            <Select {...aria} {...register('customerId')}>
              {!customers.data && (
                <option value={shipment.customer.id}>{shipment.customer.companyName}</option>
              )}
              {customers.data?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {editable.has('containerId') && (
        <Field id="edit-containerId" label="Container" error={errors.containerId?.message}>
          {(aria) => (
            <Select {...aria} {...register('containerId')}>
              {containerOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.containerNumber} ({CONTAINER_TYPE_LABEL[c.containerType]})
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {(editable.has('origin') || editable.has('destination')) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {editable.has('origin') && (
            <Field id="edit-origin" label="Origin" error={errors.origin?.message}>
              {(aria) => <Input {...aria} {...register('origin')} />}
            </Field>
          )}
          {editable.has('destination') && (
            <Field id="edit-destination" label="Destination" error={errors.destination?.message}>
              {(aria) => <Input {...aria} {...register('destination')} />}
            </Field>
          )}
        </div>
      )}
      {editable.has('estimatedDeliveryAt') && (
        <Field
          id="edit-eta"
          label="Estimated delivery (ETA)"
          error={errors.estimatedDeliveryAt?.message}
          hint="Your local time. A revised ETA must be in the future."
        >
          {(aria) => <Input type="datetime-local" {...aria} {...register('estimatedDeliveryAt')} />}
        </Field>
      )}
      {editable.has('notes') && (
        <Field id="edit-notes" label="Notes" optional error={errors.notes?.message}>
          {(aria) => <Textarea rows={3} maxLength={1000} {...aria} {...register('notes')} />}
        </Field>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

export function EditShipmentDialog({ shipment }: { shipment: ShipmentDetail }) {
  const [open, setOpen] = useState(false);
  if (shipment.editableFields.length === 0) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Pencil aria-hidden /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent title={`Edit ${shipment.shipmentNumber}`}>
        {open && <EditForm shipment={shipment} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}
