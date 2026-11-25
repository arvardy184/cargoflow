import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ContainersController } from './containers.controller';
import { ContainersService } from './containers.service';

@Module({
  imports: [AuditModule],
  controllers: [ContainersController],
  providers: [ContainersService],
})
export class ContainersModule {}
