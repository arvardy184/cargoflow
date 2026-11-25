import * as React from 'react';
import { cn } from '@/lib/utils';

const controlBase =
  'w-full rounded-control border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/70 transition-colors focus-visible:border-harbor focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-harbor/25 disabled:cursor-not-allowed disabled:bg-paper disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/20';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlBase, 'h-9', className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlBase, 'min-h-20 py-2', className)} {...props} />;
}

/** Native select: accessible, keyboard-friendly and good on mobile without extra JS. */
export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlBase, 'h-9 pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium text-ink', className)} {...props} />;
}

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  className?: string;
  children: (aria: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby'?: string;
  }) => React.ReactNode;
}

/** Label + control + hint/error, wired together for screen readers. */
export function Field({ id, label, error, hint, optional, className, children }: FieldProps) {
  const describedBy =
    [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {optional && <span className="ml-1 font-normal text-muted">(optional)</span>}
      </Label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
