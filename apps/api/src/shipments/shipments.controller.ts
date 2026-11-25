import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import {
  ChangeShipmentStatusDto,
  CreateShipmentDto,
  ShipmentQueryDto,
  UpdateShipmentDto,
} from './shipments.dto';
import { ShipmentsService } from './shipments.service';

@ApiTags('shipments')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Get()
  @ApiOperation({
    summary: 'List shipments',
    description:
      'Paginated; supports search by shipment number, status, customer and overdue filters, sorting by createdAt or ETA.',
  })
  list(@Query() query: ShipmentQueryDto) {
    return this.shipments.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a shipment (starts in DRAFT)' })
  @ApiConflictResponse({ description: 'Container is assigned to another active shipment' })
  create(@Body() dto: CreateShipmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.shipments.create(dto, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get shipment detail incl. allowed transitions for the caller' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.shipments.findById(id, user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit shipment fields',
    description:
      'DRAFT: all fields (customer re-assignment ADMIN-only). BOOKED/IN_TRANSIT: ETA and notes. DELIVERED: read-only.',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateShipmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shipments.update(id, dto, user);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Advance shipment status (DRAFT → BOOKED → IN_TRANSIT → DELIVERED)' })
  @ApiConflictResponse({ description: 'Invalid transition or concurrent modification' })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeShipmentStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shipments.changeStatus(id, dto, user);
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'Status history (oldest first)' })
  events(@Param('id') id: string) {
    return this.shipments.listEvents(id);
  }
}
