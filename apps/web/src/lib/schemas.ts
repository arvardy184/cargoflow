import { z } from 'zod';
import { CONTAINER_TYPES } from './api/types';

/**
 * Client-side form validation mirrors the API's DTO constraints for fast feedback. The API
 * remains authoritative: its field errors are mapped back onto the same form fields.
 */

const normalizeLocation = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address.')
    .pipe(z.email('Enter a valid email address.')),
  password: z.string().min(1, 'Enter your password.'),
});
export type LoginValues = z.infer<typeof loginSchema>;

const location = (label: string) =>
  z
    .string()
    .trim()
    .min(2, `${label} must be at least 2 characters.`)
    .max(100, `${label} must be at most 100 characters.`);

/** `now` is injectable so tests are deterministic. */
export function futureDateTime(now: () => Date = () => new Date()) {
  return z
    .string()
    .min(1, 'Choose an estimated delivery date and time.')
    .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Enter a valid date and time.')
    .refine((v) => new Date(v).getTime() > now().getTime(), 'The ETA must be in the future.');
}

const notes = z.string().trim().max(1000, 'Notes must be at most 1000 characters.');

export function createShipmentSchema(now?: () => Date) {
  return z
    .object({
      customerId: z.string().min(1, 'Select a customer.'),
      containerId: z.string().min(1, 'Select a container.'),
      origin: location('Origin'),
      destination: location('Destination'),
      estimatedDeliveryAt: futureDateTime(now),
      notes,
    })
    .refine((v) => normalizeLocation(v.origin) !== normalizeLocation(v.destination), {
      path: ['destination'],
      message: 'Destination must be different from the origin.',
    });
}
export type CreateShipmentValues = z.infer<ReturnType<typeof createShipmentSchema>>;

/** Edit form: every field optional because which ones are shown depends on status and role. */
export function editShipmentSchema(now?: () => Date) {
  return z.object({
    customerId: z.string().min(1, 'Select a customer.').optional(),
    containerId: z.string().min(1, 'Select a container.').optional(),
    origin: location('Origin').optional(),
    destination: location('Destination').optional(),
    estimatedDeliveryAt: futureDateTime(now).optional(),
    notes: notes.optional(),
  });
}
export type EditShipmentValues = z.infer<ReturnType<typeof editShipmentSchema>>;

export const transitionSchema = z.object({
  remarks: z.string().trim().max(500, 'Remarks must be at most 500 characters.'),
});
export type TransitionValues = z.infer<typeof transitionSchema>;

export const customerSchema = z.object({
  companyName: z.string().trim().min(2, 'Company name must be at least 2 characters.').max(150),
  contactPerson: z.string().trim().min(2, 'Contact person must be at least 2 characters.').max(120),
  email: z.string().trim().pipe(z.email('Enter a valid email address.')),
  phone: z
    .string()
    .trim()
    .regex(
      /^\+?[0-9][0-9 ()-]{6,24}$/,
      'Start with a digit or +, then use digits, spaces, dashes or brackets (7–25 characters).',
    ),
});
export type CustomerValues = z.infer<typeof customerSchema>;

export const containerSchema = z.object({
  containerNumber: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, '').toUpperCase())
    .pipe(
      z
        .string()
        .regex(
          /^[A-Z]{3}[UJZ]\d{7}$/,
          'Use the ISO 6346 format: 4 letters and 7 digits, e.g. CSQU3054383.',
        ),
    ),
  containerType: z.enum(CONTAINER_TYPES as [string, ...string[]], {
    message: 'Select a container type.',
  }),
});
export type ContainerValues = z.input<typeof containerSchema>;
