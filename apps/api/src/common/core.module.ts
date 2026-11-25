import { Global, Module } from '@nestjs/common';
import { APP_ENV, loadEnv } from '../config/env';
import { Clock, SystemClock } from './clock';

@Global()
@Module({
  providers: [
    { provide: APP_ENV, useFactory: () => loadEnv() },
    { provide: Clock, useClass: SystemClock },
  ],
  exports: [APP_ENV, Clock],
})
export class CoreModule {}
