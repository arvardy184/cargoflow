import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShipmentStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../common/pagination';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** Optional, but when present must not be null (unlike @IsOptional, which also skips null). */
const IsOptionalNonNull = () => ValidateIf((_object, value) => value !== undefined);

export class CreateShipmentDto {
  @ApiProperty() @IsString() @Length(1, 30) customerId!: string;

  @ApiProperty() @IsString() @Length(1, 30) containerId!: string;

  @ApiProperty({ example: 'Jakarta (Tanjung Priok)' })
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  origin!: string;

  @ApiProperty({ example: 'Surabaya (Tanjung Perak)' })
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  destination!: string;

  @ApiProperty({
    example: '2026-12-01T09:00:00.000Z',
    description: 'ISO-8601 timestamp; must be in the future',
  })
  @IsISO8601(
    { strict: true },
    { message: 'estimatedDeliveryAt must be a valid ISO-8601 date-time' },
  )
  estimatedDeliveryAt!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

/** All fields optional; which ones may actually change depends on status and role (see domain). */
export class UpdateShipmentDto {
  @ApiPropertyOptional() @IsOptionalNonNull() @IsString() @Length(1, 30) customerId?: string;

  @ApiPropertyOptional() @IsOptionalNonNull() @IsString() @Length(1, 30) containerId?: string;

  @ApiPropertyOptional()
  @IsOptionalNonNull()
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  origin?: string;

  @ApiPropertyOptional()
  @IsOptionalNonNull()
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  destination?: string;

  @ApiPropertyOptional()
  @IsOptionalNonNull()
  @IsISO8601(
    { strict: true },
    { message: 'estimatedDeliveryAt must be a valid ISO-8601 date-time' },
  )
  estimatedDeliveryAt?: string;

  @ApiPropertyOptional({ nullable: true, description: 'null or empty string clears the notes' })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class ChangeShipmentStatusDto {
  @ApiProperty({ enum: ShipmentStatus, description: 'Requested next status' })
  @IsEnum(ShipmentStatus)
  status!: ShipmentStatus;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(500)
  remarks?: string | null;
}

export const SHIPMENT_SORT_FIELDS = ['createdAt', 'estimatedDeliveryAt'] as const;

export class ShipmentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Shipment number contains (case-insensitive)' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(20)
  search?: string;

  @ApiPropertyOptional({ enum: ShipmentStatus })
  @IsOptional()
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerId?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  overdue?: 'true' | 'false';

  @ApiPropertyOptional({ enum: SHIPMENT_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(SHIPMENT_SORT_FIELDS)
  sortBy: (typeof SHIPMENT_SORT_FIELDS)[number] = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
