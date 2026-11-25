import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';

/**
 * Structured access log: method, path (without query string), status, duration and user id.
 * Request bodies, headers, cookies and tokens are deliberately never logged.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const user = (req as Request & { user?: AuthenticatedUser }).user;
      this.logger.log({
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Math.round(durationMs),
        userId: user?.id ?? null,
      });
    });
    next();
  }
}
