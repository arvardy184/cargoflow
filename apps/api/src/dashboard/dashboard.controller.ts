import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Operational KPIs, shipments needing attention and recent activity',
    description:
      'onTimeDeliveryRate = round(onTimeDelivered / delivered × 100, 1); null when no shipment has been delivered.',
  })
  summary() {
    return this.dashboard.getSummary();
  }
}
