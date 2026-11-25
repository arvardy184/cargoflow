import { Prisma, ShipmentStatus } from '@prisma/client';

/**
 * Operational metrics derived from authoritative shipment fields. Overdue is NOT a lifecycle
 * status: it is computed from (status, estimatedDeliveryAt, now) and never stored.
 */

export interface OverdueInput {
  status: ShipmentStatus;
  estimatedDeliveryAt: Date;
}

export function isOverdue(shipment: OverdueInput, now: Date): boolean {
  return (
    shipment.status !== ShipmentStatus.DELIVERED &&
    shipment.estimatedDeliveryAt.getTime() < now.getTime()
  );
}

/** The same rule expressed as a Prisma filter, so list queries and counts run in MySQL. */
export function overdueWhere(now: Date): Prisma.ShipmentWhereInput {
  return { status: { not: ShipmentStatus.DELIVERED }, estimatedDeliveryAt: { lt: now } };
}

export type DeliveryPerformance = 'ON_TIME' | 'LATE';

/** A delivery is on time when actualDeliveryAt <= estimatedDeliveryAt (inclusive). */
export function getDeliveryPerformance(shipment: {
  status: ShipmentStatus;
  estimatedDeliveryAt: Date;
  actualDeliveryAt: Date | null;
}): DeliveryPerformance | null {
  if (shipment.status !== ShipmentStatus.DELIVERED || !shipment.actualDeliveryAt) return null;
  return shipment.actualDeliveryAt.getTime() <= shipment.estimatedDeliveryAt.getTime()
    ? 'ON_TIME'
    : 'LATE';
}

/**
 * On-time delivery rate (%) = onTimeDelivered / delivered × 100, rounded to one decimal place.
 * Returns null when nothing has been delivered yet (rate is undefined, not 0% or 100%).
 */
export function computeOnTimeRate(onTimeDelivered: number, delivered: number): number | null {
  if (delivered <= 0) return null;
  const bounded = Math.min(Math.max(onTimeDelivered, 0), delivered);
  return Math.round((bounded / delivered) * 1000) / 10;
}

export interface StatusCounts {
  DRAFT: number;
  BOOKED: number;
  IN_TRANSIT: number;
  DELIVERED: number;
}

export interface DashboardKpis {
  totalShipments: number;
  activeShipments: number;
  deliveredShipments: number;
  overdueShipments: number;
  onTimeDeliveredShipments: number;
  onTimeDeliveryRate: number | null;
  statusBreakdown: StatusCounts;
}

/**
 * Active = committed work that is not yet delivered (BOOKED + IN_TRANSIT). DRAFT shipments are
 * reported separately in the breakdown because they are not yet operationally committed.
 */
export function buildDashboardKpis(input: {
  statusCounts: Partial<StatusCounts>;
  overdueCount: number;
  onTimeDeliveredCount: number;
}): DashboardKpis {
  const statusBreakdown: StatusCounts = {
    DRAFT: input.statusCounts.DRAFT ?? 0,
    BOOKED: input.statusCounts.BOOKED ?? 0,
    IN_TRANSIT: input.statusCounts.IN_TRANSIT ?? 0,
    DELIVERED: input.statusCounts.DELIVERED ?? 0,
  };
  const totalShipments =
    statusBreakdown.DRAFT +
    statusBreakdown.BOOKED +
    statusBreakdown.IN_TRANSIT +
    statusBreakdown.DELIVERED;
  return {
    totalShipments,
    activeShipments: statusBreakdown.BOOKED + statusBreakdown.IN_TRANSIT,
    deliveredShipments: statusBreakdown.DELIVERED,
    overdueShipments: input.overdueCount,
    onTimeDeliveredShipments: input.onTimeDeliveredCount,
    onTimeDeliveryRate: computeOnTimeRate(input.onTimeDeliveredCount, statusBreakdown.DELIVERED),
    statusBreakdown,
  };
}
