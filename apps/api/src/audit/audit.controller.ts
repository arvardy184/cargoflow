import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { AuditLogQueryDto } from './audit.dto';
import { AuditService } from './audit.service';

@ApiTags('audit')
@ApiBearerAuth()
@ApiCookieAuth()
@Roles(Role.ADMIN)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit records (ADMIN only), newest first' })
  @ApiForbiddenResponse({ description: 'Caller is not an ADMIN' })
  list(@Query() query: AuditLogQueryDto) {
    return this.audit.list(query);
  }
}
