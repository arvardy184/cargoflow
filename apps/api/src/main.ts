import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './app.setup';
import { loadDotEnvFile, loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  loadDotEnvFile();
  const env = loadEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // Structured JSON logs in production; human-readable logs locally.
    logger: new ConsoleLogger({
      json: env.NODE_ENV === 'production',
      colors: env.NODE_ENV !== 'production',
    }),
  });
  configureApp(app, env);
  setupSwagger(app);

  await app.listen(env.PORT);
  Logger.log(
    `CargoFlow API listening on http://localhost:${env.PORT}/api (docs: /api/docs)`,
    'Bootstrap',
  );
}

void bootstrap();
