import { Injectable } from '@nestjs/common';
import { AuditAction, AuditEntityType, Prisma } from '@prisma/client';
import { paginated } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogQueryDto } from './audit.dto';

export interface AuditEntry {
  actorId: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  beforeData?: Prisma.InputJsonObject | null;
  afterData?: Prisma.InputJsonObject | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes an audit record using the caller's transaction client, so the audit entry commits
   * or rolls back together with the business change it describes.
   */
  async record(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId: entry.actorId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        beforeData: entry.beforeData ?? Prisma.DbNull,
        afterData: entry.afterData ?? Prisma.DbNull,
      },
    });
  }

  async list(query: AuditLogQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      entityType: query.entityType,
      entityId: query.entityId,
      action: query.action,
      actorId: query.actorId,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { actor: { select: { id: true, fullName: true, role: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const labels = await this.resolveEntityLabels(rows);
    const data = rows.map((row) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      entityLabel: labels.get(`${row.entityType}:${row.entityId}`) ?? null,
      action: row.action,
      beforeData: row.beforeData,
      afterData: row.afterData,
      actor: row.actor,
      createdAt: row.createdAt,
    }));
    return paginated(data, total, query);
  }

  /** Resolves human-readable labels (shipment number, company name…) in at most 3 queries. */
  private async resolveEntityLabels(
    rows: { entityType: AuditEntityType; entityId: string }[],
  ): Promise<Map<string, string>> {
    const idsFor = (type: AuditEntityType) => [
      ...new Set(rows.filter((r) => r.entityType === type).map((r) => r.entityId)),
    ];
    const [shipmentIds, customerIds, containerIds] = [
      idsFor(AuditEntityType.SHIPMENT),
      idsFor(AuditEntityType.CUSTOMER),
      idsFor(AuditEntityType.CONTAINER),
    ];

    const [shipments, customers, containers] = await Promise.all([
      shipmentIds.length
        ? this.prisma.shipment.findMany({
            where: { id: { in: shipmentIds } },
            select: { id: true, shipmentNumber: true },
          })
        : [],
      customerIds.length
        ? this.prisma.customer.findMany({
            where: { id: { in: customerIds } },
            select: { id: true, companyName: true },
          })
        : [],
      containerIds.length
        ? this.prisma.container.findMany({
            where: { id: { in: containerIds } },
            select: { id: true, containerNumber: true },
          })
        : [],
    ]);

    const labels = new Map<string, string>();
    shipments.forEach((s) => labels.set(`SHIPMENT:${s.id}`, s.shipmentNumber));
    customers.forEach((c) => labels.set(`CUSTOMER:${c.id}`, c.companyName));
    containers.forEach((c) => labels.set(`CONTAINER:${c.id}`, c.containerNumber));
    return labels;
  }
}
