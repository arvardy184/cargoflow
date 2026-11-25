import { Role, ShipmentStatus } from '@prisma/client';
import { DomainError } from '../../common/errors/domain-error';

/**
 * The shipment state machine — the single source of truth for lifecycle rules.
 *
 *   DRAFT ──▶ BOOKED ──▶ IN_TRANSIT ──▶ DELIVERED (terminal)
 *
 * Status is never written anywhere else: ShipmentsService.changeStatus() is the only code path
 * that mutates `Shipment.status`, and it always calls assertTransition() first.
 */
export const SHIPMENT_TRANSITIONS: Readonly<Record<ShipmentStatus, readonly ShipmentStatus[]>> = {
  DRAFT: [ShipmentStatus.BOOKED],
  BOOKED: [ShipmentStatus.IN_TRANSIT],
  IN_TRANSIT: [ShipmentStatus.DELIVERED],
  DELIVERED: [],
};

/** Roles permitted to perform status transitions. */
export const TRANSITION_ROLES: readonly Role[] = [Role.ADMIN, Role.OPERATIONS];

export function getAllowedTransitions(status: ShipmentStatus, role?: Role): ShipmentStatus[] {
  if (role && !TRANSITION_ROLES.includes(role)) return [];
  return [...SHIPMENT_TRANSITIONS[status]];
}

export function canTransition(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return SHIPMENT_TRANSITIONS[from].includes(to);
}

export function isTerminalStatus(status: ShipmentStatus): boolean {
  return SHIPMENT_TRANSITIONS[status].length === 0;
}

export function assertTransition(from: ShipmentStatus, to: ShipmentStatus): void {
  if (canTransition(from, to)) return;

  const allowed = SHIPMENT_TRANSITIONS[from];
  const reason = isTerminalStatus(from)
    ? `Shipment is ${from}, which is a final status; no further transitions are possible.`
    : from === to
      ? `Shipment is already ${from}.`
      : `Cannot move a shipment from ${from} to ${to}. Allowed next status: ${allowed.join(', ')}.`;

  throw new DomainError('INVALID_STATUS_TRANSITION', reason, {
    currentStatus: from,
    requestedStatus: to,
    allowedTransitions: allowed,
  });
}

// ---------------------------------------------------------------------------------------------
// Editing rules
// ---------------------------------------------------------------------------------------------

export const EDITABLE_SHIPMENT_FIELDS = [
  'customerId',
  'containerId',
  'origin',
  'destination',
  'estimatedDeliveryAt',
  'notes',
] as const;

export type EditableShipmentField = (typeof EDITABLE_SHIPMENT_FIELDS)[number];

/**
 * Which fields may change, by status and role:
 *  - DRAFT: everything is still a plan. Re-assigning the customer (commercial ownership) is
 *    ADMIN-only; OPERATIONS may change container, route, ETA and notes.
 *  - BOOKED / IN_TRANSIT: the booking is committed; only the ETA may be revised and notes added.
 *  - DELIVERED: the record is final and read-only.
 */
const EDITABLE_FIELDS: Readonly<
  Record<ShipmentStatus, Readonly<Record<Role, readonly EditableShipmentField[]>>>
> = {
  DRAFT: {
    ADMIN: EDITABLE_SHIPMENT_FIELDS,
    OPERATIONS: ['containerId', 'origin', 'destination', 'estimatedDeliveryAt', 'notes'],
  },
  BOOKED: {
    ADMIN: ['estimatedDeliveryAt', 'notes'],
    OPERATIONS: ['estimatedDeliveryAt', 'notes'],
  },
  IN_TRANSIT: {
    ADMIN: ['estimatedDeliveryAt', 'notes'],
    OPERATIONS: ['estimatedDeliveryAt', 'notes'],
  },
  DELIVERED: { ADMIN: [], OPERATIONS: [] },
};

export function getEditableFields(status: ShipmentStatus, role: Role): EditableShipmentField[] {
  return [...EDITABLE_FIELDS[status][role]];
}

export function assertFieldsEditable(
  status: ShipmentStatus,
  role: Role,
  fields: readonly EditableShipmentField[],
): void {
  if (status === ShipmentStatus.DELIVERED) {
    throw new DomainError(
      'SHIPMENT_LOCKED',
      'Delivered shipments are final and can no longer be edited.',
    );
  }

  const allowedForRole = EDITABLE_FIELDS[status][role];
  const allowedForAnyRole = new Set(Object.values(EDITABLE_FIELDS[status]).flat());

  const lockedByStatus = fields.filter((f) => !allowedForAnyRole.has(f));
  if (lockedByStatus.length > 0) {
    throw new DomainError(
      'FIELD_NOT_EDITABLE',
      `These fields cannot be changed while the shipment is ${status}: ${lockedByStatus.join(', ')}.`,
      { status, fields: lockedByStatus, editableFields: allowedForRole },
    );
  }

  const lockedByRole = fields.filter((f) => !allowedForRole.includes(f));
  if (lockedByRole.length > 0) {
    throw new DomainError(
      'FORBIDDEN_FIELD',
      `Your role (${role}) is not permitted to change: ${lockedByRole.join(', ')}.`,
      { role, fields: lockedByRole },
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Field-level business validation
// ---------------------------------------------------------------------------------------------

function normalizeLocation(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function assertValidRoute(origin: string, destination: string): void {
  if (!origin.trim() || !destination.trim()) {
    throw new DomainError('INVALID_ROUTE', 'Origin and destination are required.');
  }
  if (normalizeLocation(origin) === normalizeLocation(destination)) {
    throw new DomainError('INVALID_ROUTE', 'Origin and destination must be different locations.', [
      { field: 'destination', messages: ['destination must differ from origin'] },
    ]);
  }
}

/** An ETA, whenever it is set or revised, must lie in the future. */
export function assertEtaInFuture(eta: Date, now: Date): void {
  if (Number.isNaN(eta.getTime())) {
    throw new DomainError('INVALID_ETA', 'Estimated delivery date is not a valid date.');
  }
  if (eta.getTime() <= now.getTime()) {
    throw new DomainError('INVALID_ETA', 'Estimated delivery date must be in the future.', [
      { field: 'estimatedDeliveryAt', messages: ['estimatedDeliveryAt must be in the future'] },
    ]);
  }
}
