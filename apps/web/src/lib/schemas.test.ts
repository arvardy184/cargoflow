import { describe, expect, it } from 'vitest';
import { containerSchema, createShipmentSchema, customerSchema, loginSchema } from './schemas';

/** First message per field — the one the form resolver displays. */
const messages = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) => {
  const out: Record<string, string> = {};
  for (const issue of result.error?.issues ?? []) out[issue.path.join('.')] ??= issue.message;
  return out;
};

describe('loginSchema', () => {
  it('requires a valid email and a password', () => {
    expect(messages(loginSchema.safeParse({ email: '', password: '' }))).toEqual({
      email: 'Enter your email address.',
      password: 'Enter your password.',
    });
    expect(messages(loginSchema.safeParse({ email: 'nope', password: 'x' }))).toEqual({
      email: 'Enter a valid email address.',
    });
  });

  it('trims the email', () => {
    expect(loginSchema.parse({ email: ' ops@cargoflow.local ', password: 'x' }).email).toBe(
      'ops@cargoflow.local',
    );
  });
});

describe('createShipmentSchema', () => {
  const now = new Date('2026-06-01T12:00:00');
  const schema = createShipmentSchema(() => now);
  const valid = {
    customerId: 'c1',
    containerId: 'k1',
    origin: 'Jakarta',
    destination: 'Surabaya',
    estimatedDeliveryAt: '2026-06-02T09:00',
    notes: '',
  };

  it('accepts a valid shipment', () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it('requires customer and container selections', () => {
    expect(messages(schema.safeParse({ ...valid, customerId: '', containerId: '' }))).toEqual({
      customerId: 'Select a customer.',
      containerId: 'Select a container.',
    });
  });

  it('rejects the same origin and destination, ignoring case and spacing', () => {
    expect(messages(schema.safeParse({ ...valid, destination: '  jakarta ' }))).toEqual({
      destination: 'Destination must be different from the origin.',
    });
  });

  it('rejects an ETA that is not in the future', () => {
    expect(
      messages(schema.safeParse({ ...valid, estimatedDeliveryAt: '2026-06-01T12:00' })),
    ).toEqual({
      estimatedDeliveryAt: 'The ETA must be in the future.',
    });
    expect(
      messages(schema.safeParse({ ...valid, estimatedDeliveryAt: '' })).estimatedDeliveryAt,
    ).toBe('Choose an estimated delivery date and time.');
  });

  it('enforces length limits like the API', () => {
    const result = messages(schema.safeParse({ ...valid, origin: 'J', notes: 'x'.repeat(1001) }));
    expect(result.origin).toBe('Origin must be at least 2 characters.');
    expect(result.notes).toBe('Notes must be at most 1000 characters.');
  });
});

describe('customerSchema', () => {
  const valid = {
    companyName: 'PT Uji',
    contactPerson: 'Ani',
    email: 'ani@uji.example',
    phone: '+62 21 555 0101',
  };

  // Same pattern as the API DTO: must start with a digit or "+".
  it.each(['+62 21 555 0101', '021 (555) 0101', '0812-345-678'])('accepts phone %s', (phone) => {
    expect(customerSchema.safeParse({ ...valid, phone }).success).toBe(true);
  });

  it.each(['call me', '12345', '(021) 555-0101', '+62-21-555-0101-0101-0101-0101'])(
    'rejects phone %s',
    (phone) => {
      expect(customerSchema.safeParse({ ...valid, phone }).success).toBe(false);
    },
  );
});

describe('containerSchema', () => {
  it('normalises spacing, dashes and case', () => {
    expect(
      containerSchema.parse({ containerNumber: 'csqu 305438-3', containerType: 'DRY_20' })
        .containerNumber,
    ).toBe('CSQU3054383');
  });

  it('rejects a malformed number and a missing type', () => {
    const result = messages(
      containerSchema.safeParse({ containerNumber: 'CSQ123', containerType: '' }),
    );
    expect(Object.keys(result).sort()).toEqual(['containerNumber', 'containerType']);
  });
});
