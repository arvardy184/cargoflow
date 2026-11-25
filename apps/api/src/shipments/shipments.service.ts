import { Injectable } from '@nestjs/common';
import { AuditAction, AuditEntityType, Prisma, Shipment, ShipmentStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { toSnapshot } from '../common/audit-snapshot';
import { Clock } from '../common/clock';
import { DomainError } from '../common/errors/domain-error';
import { paginated, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertEtaInFuture,
  assertFieldsEditable,
  assertTransition,
  assertValidRoute,
  EDITABLE_SHIPMENT_FIELDS,
  EditableShipmentField,
} from './domain/shipment-lifecycle';
import { overdueWhere } from './domain/shipment-metrics';
import {
  SHIPMENT_DETAIL_INCLUDE,
  SHIPMENT_LIST_INCLUDE,
  toShipmentDetail,
  toShipmentSummary,
} from './shipment.presenter';
import {
  ChangeShipmentStatusDto,
  CreateShipmentDto,
  ShipmentQueryDto,
  UpdateShipmentDto,
} from './shipments.dto';

const SNAPSHOT_FIELDS = [
  'shipmentNumber',
  'customerId',
  'containerId',
  'origin',
  'destination',
  'estimatedDeliveryAt',
  'status',
  'notes',
] as const;

type EditableValues = Pick<Shipment, EditableShipmentField>;

/**
 * Transactions that may assign a container run at READ COMMITTED:
 *  - every plain read sees the latest committed rows, so once the container row lock is held
 *    the availability check observes any shipment committed by the transaction we waited on;
 *  - no gap locks are taken, so concurrent creates for different containers cannot deadlock
 *    (a locking read at REPEATABLE READ would gap-lock the empty index range and deadlock).
 */
const CONTAINER_ASSIGNMENT_TX = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
} as const;

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  // ------------------------------------------------------------------------------------------
  // Queries
  // ------------------------------------------------------------------------------------------

  async list(query: ShipmentQueryDto) {
    const now = this.clock.now();
    const filters: Prisma.ShipmentWhereInput[] = [];
    if (query.search) filters.push({ shipmentNumber: { contains: query.search } });
    if (query.status) filters.push({ status: query.status });
    if (query.customerId) filters.push({ customerId: query.customerId });
    if (query.overdue === 'true') filters.push(overdueWhere(now));
    if (query.overdue === 'false') filters.push({ NOT: overdueWhere(now) });
    const where: Prisma.ShipmentWhereInput = { AND: filters };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.shipment.findMany({
        where,
        include: SHIPMENT_LIST_INCLUDE,
        // Secondary key keeps pagination stable when sort values tie.
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: query.sortOrder }],
        ...toSkipTake(query),
      }),
      this.prisma.shipment.count({ where }),
    ]);
    return paginated(
      rows.map((row) => toShipmentSummary(row, now)),
      total,
      query,
    );
  }

  async findById(id: string, actor: AuthenticatedUser) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
      include: SHIPMENT_DETAIL_INCLUDE,
    });
    if (!shipment) throw DomainError.notFound('Shipment', id);
    return toShipmentDetail(shipment, this.clock.now(), actor.role);
  }

  async listEvents(id: string) {
    const exists = await this.prisma.shipment.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw DomainError.notFound('Shipment', id);
    return this.prisma.shipmentEvent.findMany({
      where: { shipmentId: id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        previousStatus: true,
        newStatus: true,
        remarks: true,
        createdAt: true,
        changedBy: { select: { id: true, fullName: true, role: true } },
      },
    });
  }

  // ------------------------------------------------------------------------------------------
  // Commands
  // ------------------------------------------------------------------------------------------

  async create(dto: CreateShipmentDto, actor: AuthenticatedUser) {
    const now = this.clock.now();
    const eta = new Date(dto.estimatedDeliveryAt);
    assertValidRoute(dto.origin, dto.destination);
    assertEtaInFuture(eta, now);

    const shipmentId = await this.prisma.$transaction(async (tx) => {
      await this.assertCustomerExists(tx, dto.customerId);
      await this.lockAvailableContainer(tx, dto.containerId);
      const shipmentNumber = await this.nextShipmentNumber(tx, now);

      const shipment = await tx.shipment.create({
        data: {
          shipmentNumber,
          customerId: dto.customerId,
          containerId: dto.containerId,
          origin: dto.origin,
          destination: dto.destination,
          estimatedDeliveryAt: eta,
          notes: dto.notes ?? null,
          status: ShipmentStatus.DRAFT,
          createdById: actor.id,
        },
      });
      await tx.shipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          previousStatus: null,
          newStatus: ShipmentStatus.DRAFT,
          changedById: actor.id,
          remarks: 'Shipment created',
        },
      });
      await this.audit.record(tx, {
        actorId: actor.id,
        entityType: AuditEntityType.SHIPMENT,
        entityId: shipment.id,
        action: AuditAction.CREATE,
        afterData: toSnapshot(shipment, SNAPSHOT_FIELDS),
      });
      return shipment.id;
    }, CONTAINER_ASSIGNMENT_TX);

    return this.findById(shipmentId, actor);
  }

  async update(id: string, dto: UpdateShipmentDto, actor: AuthenticatedUser) {
    const requested = EDITABLE_SHIPMENT_FIELDS.filter((field) => dto[field] !== undefined);
    if (requested.length === 0) {
      throw new DomainError('VALIDATION_ERROR', 'Provide at least one field to update.');
    }
    const now = this.clock.now();

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.shipment.findUnique({ where: { id } });
      if (!existing) throw DomainError.notFound('Shipment', id);

      assertFieldsEditable(existing.status, actor.role, requested);

      const next: EditableValues = {
        customerId: dto.customerId ?? existing.customerId,
        containerId: dto.containerId ?? existing.containerId,
        origin: dto.origin ?? existing.origin,
        destination: dto.destination ?? existing.destination,
        estimatedDeliveryAt: dto.estimatedDeliveryAt
          ? new Date(dto.estimatedDeliveryAt)
          : existing.estimatedDeliveryAt,
        notes: dto.notes !== undefined ? dto.notes : existing.notes,
      };
      const changed = requested.filter((field) => !sameValue(existing[field], next[field]));
      if (changed.length === 0) return;

      if (changed.includes('origin') || changed.includes('destination')) {
        assertValidRoute(next.origin, next.destination);
      }
      if (changed.includes('estimatedDeliveryAt')) {
        assertEtaInFuture(next.estimatedDeliveryAt, now);
      }
      if (changed.includes('customerId')) await this.assertCustomerExists(tx, next.customerId);
      if (changed.includes('containerId')) {
        await this.lockAvailableContainer(tx, next.containerId, id);
      }

      const data = Object.fromEntries(changed.map((f) => [f, next[f]])) as Partial<EditableValues>;
      // Optimistic concurrency: only apply if nobody changed the shipment since we read it.
      const { count } = await tx.shipment.updateMany({
        where: { id, status: existing.status, updatedAt: existing.updatedAt },
        data,
      });
      if (count === 0) throw concurrentModification();

      await this.audit.record(tx, {
        actorId: actor.id,
        entityType: AuditEntityType.SHIPMENT,
        entityId: id,
        action: AuditAction.UPDATE,
        beforeData: toSnapshot(existing, changed),
        afterData: toSnapshot(next, changed),
      });
    }, CONTAINER_ASSIGNMENT_TX);

    return this.findById(id, actor);
  }

  /**
   * The only code path that changes Shipment.status. Status update, ShipmentEvent and AuditLog
   * are written in one transaction; the compare-and-set UPDATE (WHERE status = <current>)
   * guarantees two concurrent requests cannot both apply a transition from the same state.
   */
  async changeStatus(id: string, dto: ChangeShipmentStatusDto, actor: AuthenticatedUser) {
    const now = this.clock.now();

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.shipment.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!current) throw DomainError.notFound('Shipment', id);

      assertTransition(current.status, dto.status);

      const actualDeliveryAt = dto.status === ShipmentStatus.DELIVERED ? now : undefined;
      const { count } = await tx.shipment.updateMany({
        where: { id, status: current.status },
        data: { status: dto.status, ...(actualDeliveryAt ? { actualDeliveryAt } : {}) },
      });
      if (count === 0) throw concurrentModification();

      await tx.shipmentEvent.create({
        data: {
          shipmentId: id,
          previousStatus: current.status,
          newStatus: dto.status,
          changedById: actor.id,
          remarks: dto.remarks ?? null,
        },
      });
      await this.audit.record(tx, {
        actorId: actor.id,
        entityType: AuditEntityType.SHIPMENT,
        entityId: id,
        action: AuditAction.STATUS_CHANGE,
        beforeData: { status: current.status },
        afterData: {
          status: dto.status,
          ...(actualDeliveryAt ? { actualDeliveryAt: actualDeliveryAt.toISOString() } : {}),
          ...(dto.remarks ? { remarks: dto.remarks } : {}),
        },
      });
    });

    return this.findById(id, actor);
  }

  // ------------------------------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------------------------------

  private async assertCustomerExists(tx: Prisma.TransactionClient, customerId: string) {
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new DomainError('RELATED_RESOURCE_NOT_FOUND', 'Selected customer does not exist.', [
        { field: 'customerId', messages: ['customer does not exist'] },
      ]);
    }
  }

  /**
   * Locks the container row (SELECT … FOR UPDATE) so concurrent requests assigning the same
   * container are serialised, then verifies it is not on another undelivered shipment.
   *
   * Callers must run in a READ COMMITTED transaction (see CONTAINER_ASSIGNMENT_TX). Under
   * REPEATABLE READ the check below would read from the snapshot taken at the transaction's
   * first read — possibly before the transaction we waited on committed — and miss its shipment.
   */
  private async lockAvailableContainer(
    tx: Prisma.TransactionClient,
    containerId: string,
    excludeShipmentId?: string,
  ) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM Container WHERE id = ${containerId} FOR UPDATE`;
    if (rows.length === 0) {
      throw new DomainError('RELATED_RESOURCE_NOT_FOUND', 'Selected container does not exist.', [
        { field: 'containerId', messages: ['container does not exist'] },
      ]);
    }
    const activeAssignment = await tx.shipment.findFirst({
      where: {
        containerId,
        status: { not: ShipmentStatus.DELIVERED },
        ...(excludeShipmentId ? { NOT: { id: excludeShipmentId } } : {}),
      },
      select: { shipmentNumber: true },
    });
    if (activeAssignment) {
      throw new DomainError(
        'CONTAINER_UNAVAILABLE',
        `Container is already assigned to active shipment ${activeAssignment.shipmentNumber}.`,
        [{ field: 'containerId', messages: ['container is assigned to another active shipment'] }],
      );
    }
  }

  /** Atomically increments the per-year counter and formats e.g. CF-2026-00042. */
  private async nextShipmentNumber(tx: Prisma.TransactionClient, now: Date): Promise<string> {
    const year = now.getUTCFullYear();
    const name = `shipment-${year}`;
    await tx.$executeRaw`
      INSERT INTO SequenceCounter (name, value) VALUES (${name}, 1)
      ON DUPLICATE KEY UPDATE value = value + 1`;
    const [counter] = await tx.$queryRaw<{ value: number }[]>`
      SELECT value FROM SequenceCounter WHERE name = ${name}`;
    return `CF-${year}-${String(counter.value).padStart(5, '0')}`;
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

function concurrentModification(): DomainError {
  return new DomainError(
    'CONCURRENT_MODIFICATION',
    'This shipment was modified by another user. Reload it and try again.',
  );
}
