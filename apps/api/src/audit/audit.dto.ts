import { ApiPropertyOptional } from '@nestjs/swagger';
import { AuditAction, AuditEntityType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination';

export class AuditLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AuditEntityType })
  @IsOptional()
  @IsEnum(AuditEntityType)
  entityType?: AuditEntityType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  entityId?: string;

  @ApiPropertyOptional({ enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  actorId?: string;
}
