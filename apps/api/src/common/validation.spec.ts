import { ArgumentMetadata } from '@nestjs/common';
import { CreateShipmentDto, ShipmentQueryDto, UpdateShipmentDto } from '../shipments/shipments.dto';
import { CreateContainerDto } from '../containers/containers.dto';
import { CreateCustomerDto } from '../customers/customers.dto';
import { DomainError } from './errors/domain-error';
import { paginated, toSkipTake } from './pagination';
import { createValidationPipe, FieldViolation } from './validation';

const pipe = createValidationPipe();
const body = (metatype: new () => object): ArgumentMetadata => ({ type: 'body', metatype });
const query = (metatype: new () => object): ArgumentMetadata => ({ type: 'query', metatype });

async function violations(value: unknown, meta: ArgumentMetadata): Promise<FieldViolation[]> {
  try {
    await pipe.transform(value, meta);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'VALIDATION_ERROR') {
      return error.details as FieldViolation[];
    }
    throw error;
  }
  return [];
}

const validShipment = {
  customerId: 'c1',
  containerId: 'k1',
  origin: ' Jakarta ',
  destination: 'Surabaya',
  estimatedDeliveryAt: '2026-12-01T09:00:00.000Z',
};

describe('global validation pipe', () => {
  it('trims strings and turns blank notes into null', async () => {
    const dto = (await pipe.transform(
      { ...validShipment, notes: '   ' },
      body(CreateShipmentDto),
    )) as CreateShipmentDto;
    expect(dto.origin).toBe('Jakarta');
    expect(dto.notes).toBeNull();
  });

  it('reports field-level violations', async () => {
    const result = await violations(
      { ...validShipment, origin: 'J', estimatedDeliveryAt: 'tomorrow' },
      body(CreateShipmentDto),
    );
    expect(result.map((v) => v.field).sort()).toEqual(['estimatedDeliveryAt', 'origin']);
  });

  it('rejects unknown properties (mass-assignment protection)', async () => {
    const result = await violations(
      { ...validShipment, status: 'DELIVERED' },
      body(CreateShipmentDto),
    );
    expect(result).toEqual([{ field: 'status', messages: ['property status should not exist'] }]);
  });

  it('allows clearing notes with null on update but not other fields', async () => {
    expect(await violations({ notes: null }, body(UpdateShipmentDto))).toEqual([]);
    const result = await violations({ origin: null }, body(UpdateShipmentDto));
    expect(result.map((v) => v.field)).toEqual(['origin']);
  });

  it('normalizes container numbers and validates the check digit', async () => {
    const dto = (await pipe.transform(
      { containerNumber: 'csqu 305438-3', containerType: 'DRY_20' },
      body(CreateContainerDto),
    )) as CreateContainerDto;
    expect(dto.containerNumber).toBe('CSQU3054383');
    const result = await violations(
      { containerNumber: 'CSQU3054384', containerType: 'DRY_20' },
      body(CreateContainerDto),
    );
    expect(result[0].field).toBe('containerNumber');
  });

  it('lower-cases customer email and validates phone format', async () => {
    const dto = (await pipe.transform(
      {
        companyName: 'PT Uji',
        contactPerson: 'Ani',
        email: ' OPS@Uji.Example ',
        phone: '+62 21 555 1234',
      },
      body(CreateCustomerDto),
    )) as CreateCustomerDto;
    expect(dto.email).toBe('ops@uji.example');
    const result = await violations(
      { companyName: 'PT Uji', contactPerson: 'Ani', email: 'ops@uji.example', phone: 'call me' },
      body(CreateCustomerDto),
    );
    expect(result.map((v) => v.field)).toEqual(['phone']);
  });

  it('applies query defaults and coerces pagination numbers', async () => {
    const dto = (await pipe.transform(
      { page: '2', search: ' cf-2026 ' },
      query(ShipmentQueryDto),
    )) as ShipmentQueryDto;
    expect(dto).toMatchObject({
      page: 2,
      pageSize: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      search: 'CF-2026',
    });
  });

  it('bounds pageSize and rejects unknown sort fields', async () => {
    const result = await violations({ pageSize: '101', sortBy: 'origin' }, query(ShipmentQueryDto));
    expect(result.map((v) => v.field).sort()).toEqual(['pageSize', 'sortBy']);
  });
});

describe('pagination helpers', () => {
  it('converts page/pageSize into skip/take', () => {
    expect(toSkipTake({ page: 3, pageSize: 20 })).toEqual({ skip: 40, take: 20 });
  });

  it('computes totalPages with a minimum of 1', () => {
    expect(paginated([], 0, { page: 1, pageSize: 20 }).meta.totalPages).toBe(1);
    expect(paginated([], 41, { page: 1, pageSize: 20 }).meta.totalPages).toBe(3);
  });
});
