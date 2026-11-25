import { Injectable } from '@nestjs/common';
import { AuditAction, AuditEntityType, Customer, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { toSnapshot } from '../common/audit-snapshot';
import { DomainError } from '../common/errors/domain-error';
import { paginated, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto, CustomerQueryDto, UpdateCustomerDto } from './customers.dto';

const AUDITED_FIELDS = ['companyName', 'contactPerson', 'email', 'phone'] as const;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: CustomerQueryDto) {
    const where: Prisma.CustomerWhereInput = query.search
      ? {
          OR: [
            { companyName: { contains: query.search } },
            { contactPerson: { contains: query.search } },
            { email: { contains: query.search } },
          ],
        }
      : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { companyName: 'asc' },
        ...toSkipTake(query),
        include: { _count: { select: { shipments: true } } },
      }),
      this.prisma.customer.count({ where }),
    ]);
    return paginated(rows.map(toCustomerResponse), total, query);
  }

  async findById(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { _count: { select: { shipments: true } } },
    });
    if (!customer) throw DomainError.notFound('Customer', id);
    return toCustomerResponse(customer);
  }

  async create(dto: CreateCustomerDto, actor: AuthenticatedUser) {
    await this.assertUniqueName(dto.companyName);
    const customer = await this.prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({ data: dto });
      await this.audit.record(tx, {
        actorId: actor.id,
        entityType: AuditEntityType.CUSTOMER,
        entityId: created.id,
        action: AuditAction.CREATE,
        afterData: toSnapshot(created, AUDITED_FIELDS),
      });
      return created;
    });
    return this.findById(customer.id);
  }

  async update(id: string, dto: UpdateCustomerDto, actor: AuthenticatedUser) {
    const fields = (Object.keys(dto) as (keyof UpdateCustomerDto)[]).filter(
      (k) => dto[k] !== undefined,
    );
    if (fields.length === 0) {
      throw new DomainError('VALIDATION_ERROR', 'Provide at least one field to update.');
    }

    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw DomainError.notFound('Customer', id);
    if (dto.companyName && dto.companyName !== existing.companyName) {
      await this.assertUniqueName(dto.companyName, id);
    }

    const changed = fields.filter((k) => dto[k] !== existing[k as keyof Customer]);
    if (changed.length === 0) return this.findById(id);

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({ where: { id }, data: dto });
      await this.audit.record(tx, {
        actorId: actor.id,
        entityType: AuditEntityType.CUSTOMER,
        entityId: id,
        action: AuditAction.UPDATE,
        beforeData: toSnapshot(existing, changed),
        afterData: toSnapshot(updated, changed),
      });
    });
    return this.findById(id);
  }

  /** Friendly pre-check; the unique index remains the authoritative guard (mapped to 409). */
  private async assertUniqueName(companyName: string, excludeId?: string): Promise<void> {
    const clash = await this.prisma.customer.findFirst({
      where: { companyName, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    });
    if (clash) {
      throw new DomainError(
        'DUPLICATE_RESOURCE',
        `A customer named '${companyName}' already exists.`,
        { fields: ['companyName'] },
      );
    }
  }
}

function toCustomerResponse(customer: Customer & { _count: { shipments: number } }) {
  return {
    id: customer.id,
    companyName: customer.companyName,
    contactPerson: customer.contactPerson,
    email: customer.email,
    phone: customer.phone,
    shipmentCount: customer._count.shipments,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}
