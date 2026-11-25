'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/form-controls';
import { useSaveCustomer } from '@/lib/api/hooks';
import type { Customer } from '@/lib/api/types';
import { applyApiErrors } from '@/lib/form-errors';
import { customerSchema, type CustomerValues } from '@/lib/schemas';

const FIELDS = ['companyName', 'contactPerson', 'email', 'phone'] as const;

export function CustomerForm({
  customer,
  onSaved,
  onCancel,
}: {
  customer?: Customer;
  onSaved: (customer: Customer) => void;
  onCancel: () => void;
}) {
  const save = useSaveCustomer(customer?.id);
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<CustomerValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      companyName: customer?.companyName ?? '',
      contactPerson: customer?.contactPerson ?? '',
      email: customer?.email ?? '',
      phone: customer?.phone ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    // On edit, send only changed fields so the audit trail records exactly what changed.
    const body = customer
      ? (Object.fromEntries(
          FIELDS.filter((f) => dirtyFields[f]).map((f) => [f, values[f]]),
        ) as CustomerValues)
      : values;
    if (customer && Object.keys(body).length === 0) {
      onCancel();
      return;
    }
    try {
      onSaved(await save.mutateAsync(body));
    } catch (error) {
      setFormError(applyApiErrors(error, setError, FIELDS));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError && <Alert title="The customer was not saved">{formError}</Alert>}
      <Field id="companyName" label="Company name" error={errors.companyName?.message}>
        {(aria) => <Input autoComplete="organization" {...aria} {...register('companyName')} />}
      </Field>
      <Field id="contactPerson" label="Contact person" error={errors.contactPerson?.message}>
        {(aria) => <Input autoComplete="name" {...aria} {...register('contactPerson')} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="customer-email" label="Email" error={errors.email?.message}>
          {(aria) => <Input type="email" autoComplete="email" {...aria} {...register('email')} />}
        </Field>
        <Field id="phone" label="Phone" error={errors.phone?.message}>
          {(aria) => (
            <Input
              type="tel"
              autoComplete="tel"
              placeholder="+62 21 5550 1234"
              {...aria}
              {...register('phone')}
            />
          )}
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {customer ? 'Save changes' : 'Add customer'}
        </Button>
      </div>
    </form>
  );
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer;
  onSaved: (customer: Customer) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={customer ? `Edit ${customer.companyName}` : 'Add customer'}>
        {open && (
          <CustomerForm
            customer={customer}
            onCancel={() => onOpenChange(false)}
            onSaved={(saved) => {
              onOpenChange(false);
              onSaved(saved);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
