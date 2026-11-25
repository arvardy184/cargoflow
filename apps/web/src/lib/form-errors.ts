import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { isApiError } from './api/client';

/**
 * Puts API field violations onto matching form fields. Returns the message to show at form
 * level for anything that could not be attached to a visible field (or undefined if all were).
 */
export function applyApiErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
): string | undefined {
  if (!isApiError(error)) return 'Something went wrong. Try again.';
  const violations = error.fieldViolations.filter((v) => fields.includes(v.field));
  for (const v of violations) {
    setError(v.field as Path<T>, { type: 'server', message: capitalize(v.messages.join(' ')) });
  }
  // Domain errors (e.g. CONTAINER_UNAVAILABLE) carry a clearer message than the field hint.
  if (violations.length > 0 && error.code === 'VALIDATION_ERROR') return undefined;
  return error.message;
}

function capitalize(text: string): string {
  const trimmed = text.trim();
  const sentence = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}
