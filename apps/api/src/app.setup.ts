import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AUTH_COOKIE_NAME } from './auth/auth.types';
import { bodyParserErrorMiddleware, JSON_BODY_LIMIT } from './common/errors/body-parser-errors';
import { createValidationPipe } from './common/validation';
import { AppEnv } from './config/env';

/** HTTP pipeline shared by the real server and the integration test harness. */
export function configureApp(app: NestExpressApplication, env: AppEnv): void {
  app.setGlobalPrefix('api');
  // Behind the Next.js rewrite proxy (loopback), trust X-Forwarded-For so rate limiting keys on
  // the real client IP rather than the proxy's.
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  // JSON-only API: CSP is irrelevant for API responses and would break the Swagger UI.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.use(bodyParserErrorMiddleware);
  app.enableCors({
    origin: env.WEB_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  });
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('CargoFlow API')
    .setDescription(
      'Logistics operations API — shipments, lifecycle transitions, customers, containers, dashboard and audit trail. ' +
        'Authenticate with POST /api/auth/login, then use the returned bearer token (or the session cookie).',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addCookieAuth(AUTH_COOKIE_NAME)
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });
}
