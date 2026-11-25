import { ShipmentStatus } from '@prisma/client';
import {
  buildDashboardKpis,
  computeOnTimeRate,
  getDeliveryPerformance,
  isOverdue,
  overdueWhere,
} from './shipment-metrics';

const now = new Date('2026-06-01T12:00:00.000Z');
const before = new Date('2026-06-01T11:59:59.999Z');
const after = new Date('2026-06-01T12:00:00.001Z');

describe('isOverdue', () => {
  it.each([ShipmentStatus.DRAFT, ShipmentStatus.BOOKED, ShipmentStatus.IN_TRANSIT])(
    '%s with a past ETA is overdue',
    (status) => {
      expect(isOverdue({ status, estimatedDeliveryAt: before }, now)).toBe(true);
    },
  );

  it('is not overdue when the ETA is exactly now or later', () => {
    expect(isOverdue({ status: ShipmentStatus.BOOKED, estimatedDeliveryAt: now }, now)).toBe(false);
    expect(isOverdue({ status: ShipmentStatus.BOOKED, estimatedDeliveryAt: after }, now)).toBe(
      false,
    );
  });

  it('a delivered shipment is never overdue', () => {
    expect(isOverdue({ status: ShipmentStatus.DELIVERED, estimatedDeliveryAt: before }, now)).toBe(
      false,
    );
  });

  it('expresses the same rule as a Prisma filter', () => {
    expect(overdueWhere(now)).toEqual({
      status: { not: ShipmentStatus.DELIVERED },
      estimatedDeliveryAt: { lt: now },
    });
  });
});

describe('getDeliveryPerformance', () => {
  const eta = now;

  it('is null until delivered', () => {
    expect(
      getDeliveryPerformance({
        status: ShipmentStatus.IN_TRANSIT,
        estimatedDeliveryAt: eta,
        actualDeliveryAt: null,
      }),
    ).toBeNull();
  });

  it('on time includes delivery exactly at the ETA', () => {
    expect(
      getDeliveryPerformance({
        status: ShipmentStatus.DELIVERED,
        estimatedDeliveryAt: eta,
        actualDeliveryAt: eta,
      }),
    ).toBe('ON_TIME');
    expect(
      getDeliveryPerformance({
        status: ShipmentStatus.DELIVERED,
        estimatedDeliveryAt: eta,
        actualDeliveryAt: before,
      }),
    ).toBe('ON_TIME');
  });

  it('late when delivered after the ETA', () => {
    expect(
      getDeliveryPerformance({
        status: ShipmentStatus.DELIVERED,
        estimatedDeliveryAt: eta,
        actualDeliveryAt: after,
      }),
    ).toBe('LATE');
  });
});

describe('computeOnTimeRate', () => {
  it('is null when nothing has been delivered', () => {
    expect(computeOnTimeRate(0, 0)).toBeNull();
  });

  it('rounds to one decimal place', () => {
    expect(computeOnTimeRate(2, 3)).toBe(66.7);
    expect(computeOnTimeRate(16, 22)).toBe(72.7);
    expect(computeOnTimeRate(1, 8)).toBe(12.5);
  });

  it('covers the 0% and 100% boundaries', () => {
    expect(computeOnTimeRate(0, 5)).toBe(0);
    expect(computeOnTimeRate(5, 5)).toBe(100);
  });

  it('clamps inconsistent inputs into [0, 100]', () => {
    expect(computeOnTimeRate(7, 5)).toBe(100);
    expect(computeOnTimeRate(-1, 5)).toBe(0);
  });
});

describe('buildDashboardKpis', () => {
  it('derives totals, active count and rate from the status breakdown', () => {
    const kpis = buildDashboardKpis({
      statusCounts: { DRAFT: 7, BOOKED: 5, IN_TRANSIT: 6, DELIVERED: 22 },
      overdueCount: 3,
      onTimeDeliveredCount: 16,
    });
    expect(kpis).toEqual({
      totalShipments: 40,
      activeShipments: 11,
      deliveredShipments: 22,
      overdueShipments: 3,
      onTimeDeliveredShipments: 16,
      onTimeDeliveryRate: 72.7,
      statusBreakdown: { DRAFT: 7, BOOKED: 5, IN_TRANSIT: 6, DELIVERED: 22 },
    });
  });

  it('fills missing statuses with zero (empty database)', () => {
    const kpis = buildDashboardKpis({ statusCounts: {}, overdueCount: 0, onTimeDeliveredCount: 0 });
    expect(kpis.totalShipments).toBe(0);
    expect(kpis.statusBreakdown).toEqual({ DRAFT: 0, BOOKED: 0, IN_TRANSIT: 0, DELIVERED: 0 });
    expect(kpis.onTimeDeliveryRate).toBeNull();
  });
});
