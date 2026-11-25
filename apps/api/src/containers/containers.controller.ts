import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { ContainerQueryDto, CreateContainerDto } from './containers.dto';
import { ContainersService } from './containers.service';

@ApiTags('containers')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('containers')
export class ContainersController {
  constructor(private readonly containers: ContainersService) {}

  @Get()
  @ApiOperation({ summary: 'List containers with their current assignment' })
  list(@Query() query: ContainerQueryDto) {
    return this.containers.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Register a container (ISO 6346 number, unique)' })
  create(@Body() dto: CreateContainerDto, @CurrentUser() user: AuthenticatedUser) {
    return this.containers.create(dto, user);
  }
}
