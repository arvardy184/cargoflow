import { Injectable } from '@nestjs/common';
import { Prisma, ShipmentStatus } from '@prisma/client';
import { Clock } from '../common/clock';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildDashboardKpis,
  isOverdue,
  overdueWhere,
  StatusCounts,
} from '../shipments/domain/shipment-metrics';
import { SHIPMENT_LIST_INCLUDE, toShipmentSummary } from '../shipments/shipment.presenter';

/** Shipments due within this window (and not delivered) are flagged as needing attention. */
export const DUE_SOON_WINDOW_HOURS = 48;
const ATTENTION_LIMIT = 10;
const RECENT_ACTIVITY_LIMIT = 8;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /**
   * All KPIs are computed by MySQL (GROUP BY / COUNT with indexed predicates); no shipment
   * collection is loaded into memory. Only the two bounded lists fetch rows.
   */
  async getSummary() {
    const now = this.clock.now();
    const dueSoonCutoff = new Date(now.getTime() + DUE_SOON_WINDOW_HOURS * 60 * 60 * 1000);
    const attentionWhere: Prisma.ShipmentWhereInput = {
      status: { not: ShipmentStatus.DELIVERED },
      estimatedDeliveryAt: { lt: dueSoonCutoff },
    };

    const [grouped, overdueCount, onTimeDeliveredCount, attentionTotal, attention, recentEvents] =
      await Promise.all([
        this.prisma.shipment.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.shipment.count({ where: overdueWhere(now) }),
        this.prisma.shipment.count({
          where: {
            status: ShipmentStatus.DELIVERED,
            // Column-to-column comparison: actualDeliveryAt <= estimatedDeliveryAt
            actualDeliveryAt: { lte: this.prisma.shipment.fields.estimatedDeliveryAt },
          },
        }),
        this.prisma.shipment.count({ where: attentionWhere }),
        this.prisma.shipment.findMany({
          where: attentionWhere,
          include: SHIPMENT_LIST_INCLUDE,
          orderBy: [{ estimatedDeliveryAt: 'asc' }, { id: 'asc' }],
          take: ATTENTION_LIMIT,
        }),
        this.prisma.shipmentEvent.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: RECENT_ACTIVITY_LIMIT,
          select: {
            id: true,
            previousStatus: true,
            newStatus: true,
            remarks: true,
            createdAt: true,
            shipment: { select: { id: true, shipmentNumber: true } },
            changedBy: { select: { id: true, fullName: true } },
          },
        }),
      ]);

    const statusCounts: Partial<StatusCounts> = Object.fromEntries(
      grouped.map((g) => [g.status, g._count._all]),
    );

    return {
      generatedAt: now,
      kpis: buildDashboardKpis({ statusCounts, overdueCount, onTimeDeliveredCount }),
      attention: {
        total: attentionTotal,
        dueSoonWindowHours: DUE_SOON_WINDOW_HOURS,
        shipments: attention.map((s) => ({
          ...toShipmentSummary(s, now),
          attentionReason: isOverdue(s, now) ? ('OVERDUE' as const) : ('DUE_SOON' as const),
        })),
      },
      recentActivity: recentEvents,
    };
  }
}
