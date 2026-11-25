import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CoreModule } from './common/core.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { RequestLoggerMiddleware } from './common/request-logger.middleware';
import { ContainersModule } from './containers/containers.module';
import { CustomersModule } from './customers/customers.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ShipmentsModule } from './shipments/shipments.module';

@Module({
  imports: [
    CoreModule,
    PrismaModule,
    AuthModule,
    AuditModule,
    CustomersModule,
    ContainersModule,
    ShipmentsModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*path');
  }
}
