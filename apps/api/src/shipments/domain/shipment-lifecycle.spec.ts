import { Role, ShipmentStatus } from '@prisma/client';
import { DomainError } from '../../common/errors/domain-error';
import {
  assertEtaInFuture,
  assertFieldsEditable,
  assertTransition,
  assertValidRoute,
  canTransition,
  getAllowedTransitions,
  getEditableFields,
  isTerminalStatus,
} from './shipment-lifecycle';

const { DRAFT, BOOKED, IN_TRANSIT, DELIVERED } = ShipmentStatus;
const ALL = [DRAFT, BOOKED, IN_TRANSIT, DELIVERED];

function captureError(fn: () => void): DomainError {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('Expected a DomainError to be thrown');
}

describe('shipment state machine', () => {
  const valid: [ShipmentStatus, ShipmentStatus][] = [
    [DRAFT, BOOKED],
    [BOOKED, IN_TRANSIT],
    [IN_TRANSIT, DELIVERED],
  ];

  it.each(valid)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  const invalid = ALL.flatMap((from) => ALL.map((to) => [from, to] as const)).filter(
    ([from, to]) => !valid.some(([f, t]) => f === from && t === to),
  );

  it.each(invalid)('rejects %s → %s with INVALID_STATUS_TRANSITION (409)', (from, to) => {
    const error = captureError(() => assertTransition(from, to));
    expect(error.code).toBe('INVALID_STATUS_TRANSITION');
    expect(error.httpStatus).toBe(409);
    expect(error.details).toMatchObject({ currentStatus: from, requestedStatus: to });
  });

  it('explains terminal, same-status and skipped transitions differently', () => {
    expect(captureError(() => assertTransition(DELIVERED, BOOKED)).message).toMatch(/final status/);
    expect(captureError(() => assertTransition(BOOKED, BOOKED)).message).toMatch(/already BOOKED/);
    expect(captureError(() => assertTransition(DRAFT, DELIVERED)).message).toMatch(
      /Allowed next status: BOOKED/,
    );
  });

  it('only DELIVERED is terminal', () => {
    expect(ALL.filter(isTerminalStatus)).toEqual([DELIVERED]);
  });

  it('lists allowed transitions per status for permitted roles', () => {
    expect(getAllowedTransitions(DRAFT, Role.OPERATIONS)).toEqual([BOOKED]);
    expect(getAllowedTransitions(IN_TRANSIT, Role.ADMIN)).toEqual([DELIVERED]);
    expect(getAllowedTransitions(DELIVERED, Role.ADMIN)).toEqual([]);
  });

  it('returns a copy so callers cannot mutate the transition table', () => {
    getAllowedTransitions(DRAFT).push(DELIVERED);
    expect(getAllowedTransitions(DRAFT)).toEqual([BOOKED]);
  });
});

describe('editing rules', () => {
  it('DRAFT: ADMIN may edit everything; OPERATIONS everything except the customer', () => {
    expect(getEditableFields(DRAFT, Role.ADMIN)).toContain('customerId');
    expect(getEditableFields(DRAFT, Role.OPERATIONS)).not.toContain('customerId');
    expect(() =>
      assertFieldsEditable(DRAFT, Role.OPERATIONS, ['containerId', 'origin', 'notes']),
    ).not.toThrow();
  });

  it('DRAFT: OPERATIONS changing the customer → FORBIDDEN_FIELD (403)', () => {
    const error = captureError(() => assertFieldsEditable(DRAFT, Role.OPERATIONS, ['customerId']));
    expect(error.code).toBe('FORBIDDEN_FIELD');
    expect(error.httpStatus).toBe(403);
  });

  it.each([BOOKED, IN_TRANSIT])('%s: only ETA and notes are editable', (status) => {
    for (const role of [Role.ADMIN, Role.OPERATIONS]) {
      expect(getEditableFields(status, role)).toEqual(['estimatedDeliveryAt', 'notes']);
      expect(() =>
        assertFieldsEditable(status, role, ['estimatedDeliveryAt', 'notes']),
      ).not.toThrow();
      const error = captureError(() => assertFieldsEditable(status, role, ['origin']));
      expect(error.code).toBe('FIELD_NOT_EDITABLE');
      expect(error.httpStatus).toBe(409);
    }
  });

  it('status lock takes precedence over role restrictions', () => {
    // customerId is locked for everyone once BOOKED, so the error is FIELD_NOT_EDITABLE, not 403.
    const error = captureError(() => assertFieldsEditable(BOOKED, Role.OPERATIONS, ['customerId']));
    expect(error.code).toBe('FIELD_NOT_EDITABLE');
  });

  it('DELIVERED: everything is locked → SHIPMENT_LOCKED', () => {
    for (const role of [Role.ADMIN, Role.OPERATIONS]) {
      expect(getEditableFields(DELIVERED, role)).toEqual([]);
      expect(captureError(() => assertFieldsEditable(DELIVERED, role, ['notes'])).code).toBe(
        'SHIPMENT_LOCKED',
      );
    }
  });
});

describe('route validation', () => {
  it('accepts distinct locations', () => {
    expect(() => assertValidRoute('Jakarta', 'Surabaya')).not.toThrow();
  });

  it.each([
    ['Bitung', 'Bitung'],
    ['Bitung', '  bitung '],
    ['Medan  (Belawan)', 'medan (belawan)'],
  ])('rejects %p → %p as the same location', (origin, destination) => {
    expect(captureError(() => assertValidRoute(origin, destination)).code).toBe('INVALID_ROUTE');
  });

  it('rejects blank values', () => {
    expect(captureError(() => assertValidRoute('  ', 'Sorong')).code).toBe('INVALID_ROUTE');
  });
});

describe('ETA validation', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');

  it('accepts a future ETA', () => {
    expect(() => assertEtaInFuture(new Date('2026-06-01T00:00:00.001Z'), now)).not.toThrow();
  });

  it('rejects an ETA equal to now or in the past', () => {
    expect(captureError(() => assertEtaInFuture(now, now)).code).toBe('INVALID_ETA');
    expect(captureError(() => assertEtaInFuture(new Date('2026-05-31'), now)).code).toBe(
      'INVALID_ETA',
    );
  });

  it('rejects an invalid date', () => {
    expect(captureError(() => assertEtaInFuture(new Date('nope'), now)).message).toMatch(
      /not a valid date/,
    );
  });
});
