import { Injectable } from '@nestjs/common';
import { AuditAction, AuditEntityType, Prisma, ShipmentStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { toSnapshot } from '../common/audit-snapshot';
import { DomainError } from '../common/errors/domain-error';
import { paginated, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { ContainerQueryDto, CreateContainerDto } from './containers.dto';

/** A container is "in use" while it is assigned to any shipment that is not yet delivered. */
export const ACTIVE_ASSIGNMENT: Prisma.ShipmentWhereInput = {
  status: { not: ShipmentStatus.DELIVERED },
};

@Injectable()
export class ContainersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ContainerQueryDto) {
    const where: Prisma.ContainerWhereInput = {
      ...(query.search ? { containerNumber: { contains: query.search } } : {}),
      ...(query.containerType ? { containerType: query.containerType } : {}),
      ...(query.available === 'true' ? { shipments: { none: ACTIVE_ASSIGNMENT } } : {}),
      ...(query.available === 'false' ? { shipments: { some: ACTIVE_ASSIGNMENT } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.container.findMany({
        where,
        orderBy: { containerNumber: 'asc' },
        ...toSkipTake(query),
        include: {
          shipments: {
            where: ACTIVE_ASSIGNMENT,
            select: { id: true, shipmentNumber: true, status: true },
            take: 1,
          },
        },
      }),
      this.prisma.container.count({ where }),
    ]);

    const data = rows.map(({ shipments, ...container }) => ({
      ...container,
      activeShipment: shipments[0] ?? null,
      isAvailable: shipments.length === 0,
    }));
    return paginated(data, total, query);
  }

  async create(dto: CreateContainerDto, actor: AuthenticatedUser) {
    const exists = await this.prisma.container.findUnique({
      where: { containerNumber: dto.containerNumber },
      select: { id: true },
    });
    if (exists) {
      throw new DomainError(
        'DUPLICATE_RESOURCE',
        `Container ${dto.containerNumber} is already registered.`,
        { fields: ['containerNumber'] },
      );
    }

    const container = await this.prisma.$transaction(async (tx) => {
      const created = await tx.container.create({ data: dto });
      await this.audit.record(tx, {
        actorId: actor.id,
        entityType: AuditEntityType.CONTAINER,
        entityId: created.id,
        action: AuditAction.CREATE,
        afterData: toSnapshot(created, ['containerNumber', 'containerType']),
      });
      return created;
    });
    return { ...container, activeShipment: null, isAvailable: true };
  }
}
