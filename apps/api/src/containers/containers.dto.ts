import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContainerType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength, Validate } from 'class-validator';
import { ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination';
import { isValidContainerNumber, normalizeContainerNumber } from './domain/container-number';

@ValidatorConstraint({ name: 'isoContainerNumber' })
class IsoContainerNumberConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidContainerNumber(value);
  }

  defaultMessage(): string {
    return 'containerNumber must be a valid ISO 6346 number (e.g. MSCU1234566) with a correct check digit';
  }
}

export class CreateContainerDto {
  @ApiProperty({ example: 'CSQU3054383', description: 'ISO 6346 container number' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeContainerNumber(value) : value,
  )
  @IsString()
  @Validate(IsoContainerNumberConstraint)
  containerNumber!: string;

  @ApiProperty({ enum: ContainerType })
  @IsEnum(ContainerType)
  containerType!: ContainerType;
}

export class ContainerQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Container number contains' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(11)
  search?: string;

  @ApiPropertyOptional({ enum: ContainerType })
  @IsOptional()
  @IsEnum(ContainerType)
  containerType?: ContainerType;

  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description: 'true = only containers not assigned to an undelivered shipment',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  available?: 'true' | 'false';
}
