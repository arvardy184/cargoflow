'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/form-controls';
import { isApiError } from '@/lib/api/client';
import { useChangeShipmentStatus } from '@/lib/api/hooks';
import type { ShipmentDetail, ShipmentStatus } from '@/lib/api/types';
import { STATUS_LABEL, TRANSITION_ACTION } from '@/lib/format';
import { transitionSchema, type TransitionValues } from '@/lib/schemas';

const CONFIRM_COPY: Record<ShipmentStatus, string> = {
  DRAFT: '',
  BOOKED: 'The booking is committed. Afterwards only the ETA and notes can be changed.',
  IN_TRANSIT: 'Record that the container has departed the origin.',
  DELIVERED:
    'The delivery time is recorded as now and the shipment becomes read-only. This cannot be undone.',
};

function transitionErrorMessage(error: unknown): string {
  if (!isApiError(error)) return 'The status could not be changed. Try again.';
  if (error.code === 'CONCURRENT_MODIFICATION' || error.code === 'INVALID_STATUS_TRANSITION') {
    return `${error.message} The shipment has been refreshed with its latest status.`;
  }
  return error.message;
}

function TransitionDialog({
  shipment,
  target,
}: {
  shipment: ShipmentDetail;
  target: ShipmentStatus;
}) {
  const [open, setOpen] = useState(false);
  const change = useChangeShipmentStatus(shipment.id);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TransitionValues>({
    resolver: zodResolver(transitionSchema),
    defaultValues: { remarks: '' },
  });

  const onSubmit = handleSubmit((values) =>
    change.mutate(
      { status: target, ...(values.remarks ? { remarks: values.remarks } : {}) },
      { onSuccess: () => setOpen(false) },
    ),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
          change.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>{TRANSITION_ACTION[target]}</Button>
      </DialogTrigger>
      <DialogContent
        title={`${TRANSITION_ACTION[target]}?`}
        description={`${shipment.shipmentNumber} moves from ${STATUS_LABEL[shipment.status]} to ${STATUS_LABEL[target]}.`}
      >
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <p className="text-sm text-ink-soft">{CONFIRM_COPY[target]}</p>
          {change.isError && <Alert>{transitionErrorMessage(change.error)}</Alert>}
          <Field
            id={`remarks-${target}`}
            label="Remarks"
            optional
            error={errors.remarks?.message}
            hint="Shown in the status history."
          >
            {(aria) => <Textarea rows={3} maxLength={500} {...aria} {...register('remarks')} />}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={change.isPending}>
              {TRANSITION_ACTION[target]}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Renders exactly the transitions the API says this user may perform — no rules duplicated here. */
export function TransitionControls({ shipment }: { shipment: ShipmentDetail }) {
  if (shipment.allowedTransitions.length === 0) {
    return (
      <p className="text-sm text-muted">
        {shipment.status === 'DELIVERED'
          ? 'Delivered shipments are final. No further status changes are possible.'
          : 'You cannot change the status of this shipment.'}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      {shipment.allowedTransitions.map((target) => (
        <TransitionDialog key={target} shipment={shipment} target={target} />
      ))}
      <p className="text-sm text-muted">
        Next step: {STATUS_LABEL[shipment.allowedTransitions[0]]}
      </p>
    </div>
  );
}
