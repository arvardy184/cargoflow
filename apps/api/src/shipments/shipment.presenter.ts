import { Prisma, Role } from '@prisma/client';
import { getAllowedTransitions, getEditableFields } from './domain/shipment-lifecycle';
import { getDeliveryPerformance, isOverdue } from './domain/shipment-metrics';

export const SHIPMENT_LIST_INCLUDE = {
  customer: { select: { id: true, companyName: true } },
  container: { select: { id: true, containerNumber: true, containerType: true } },
} satisfies Prisma.ShipmentInclude;

export const SHIPMENT_DETAIL_INCLUDE = {
  customer: true,
  container: true,
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ShipmentInclude;

type ShipmentListRow = Prisma.ShipmentGetPayload<{ include: typeof SHIPMENT_LIST_INCLUDE }>;
type ShipmentDetailRow = Prisma.ShipmentGetPayload<{ include: typeof SHIPMENT_DETAIL_INCLUDE }>;

export function toShipmentSummary(s: ShipmentListRow, now: Date) {
  return {
    id: s.id,
    shipmentNumber: s.shipmentNumber,
    status: s.status,
    origin: s.origin,
    destination: s.destination,
    estimatedDeliveryAt: s.estimatedDeliveryAt,
    actualDeliveryAt: s.actualDeliveryAt,
    isOverdue: isOverdue(s, now),
    deliveryPerformance: getDeliveryPerformance(s),
    customer: s.customer,
    container: s.container,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

/**
 * Detail view. `allowedTransitions` and `editableFields` are computed from the domain rules for
 * the calling user, so the UI renders controls without duplicating any business logic.
 */
export function toShipmentDetail(s: ShipmentDetailRow, now: Date, role: Role) {
  return {
    id: s.id,
    shipmentNumber: s.shipmentNumber,
    status: s.status,
    origin: s.origin,
    destination: s.destination,
    estimatedDeliveryAt: s.estimatedDeliveryAt,
    actualDeliveryAt: s.actualDeliveryAt,
    notes: s.notes,
    isOverdue: isOverdue(s, now),
    deliveryPerformance: getDeliveryPerformance(s),
    customer: {
      id: s.customer.id,
      companyName: s.customer.companyName,
      contactPerson: s.customer.contactPerson,
      email: s.customer.email,
      phone: s.customer.phone,
    },
    container: {
      id: s.container.id,
      containerNumber: s.container.containerNumber,
      containerType: s.container.containerType,
    },
    createdBy: s.createdBy,
    allowedTransitions: getAllowedTransitions(s.status, role),
    editableFields: getEditableFields(s.status, role),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
