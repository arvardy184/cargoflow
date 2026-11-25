import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { toBodyParserDomainError } from './body-parser-errors';
import { DomainError } from './domain-error';

export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  code: string;
  message: string;
  details?: unknown;
  path: string;
  timestamp: string;
}

const HTTP_CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'TOO_MANY_REQUESTS',
};

/**
 * Single place where every error becomes an HTTP response. Guarantees a consistent body shape
 * and makes sure internal details (stack traces, SQL, Prisma metadata) never reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const { statusCode, code, message, details } = this.resolve(exception);

    if (statusCode >= 500) {
      this.logger.error(
        `Unhandled error on ${request.method} ${request.path}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponseBody = {
      statusCode,
      error: HttpStatus[statusCode] ?? 'ERROR',
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      path: request.originalUrl ?? request.url,
      timestamp: new Date().toISOString(),
    };
    response.status(statusCode).json(body);
  }

  private resolve(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    // Body-parser errors that did not pass through bodyParserErrorMiddleware (e.g. from a parser
    // Nest registers itself) are mapped the same way instead of surfacing as 500s.
    const parserError = toBodyParserDomainError(exception);
    if (parserError) exception = parserError;

    if (exception instanceof DomainError) {
      return {
        statusCode: exception.httpStatus,
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const res = exception.getResponse();
      const rawMessage =
        typeof res === 'string' ? res : (res as { message?: string | string[] }).message;
      const message = Array.isArray(rawMessage)
        ? rawMessage.join('; ')
        : (rawMessage ?? exception.message);
      return {
        statusCode,
        code: HTTP_CODE_BY_STATUS[statusCode] ?? 'HTTP_ERROR',
        message: statusCode === 429 ? 'Too many requests. Please try again later.' : message,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.resolvePrismaError(exception);
    }

    return {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    };
  }

  private resolvePrismaError(error: Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        const target = (error.meta?.target as string[] | string | undefined) ?? [];
        const fields = Array.isArray(target) ? target : [target];
        return {
          statusCode: 409,
          code: 'DUPLICATE_RESOURCE',
          message: 'A record with the same unique value already exists.',
          details: { fields },
        };
      }
      case 'P2025':
        return {
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'The requested record was not found.',
        };
      case 'P2003':
        return {
          statusCode: 400,
          code: 'RELATED_RESOURCE_NOT_FOUND',
          message: 'A referenced record does not exist.',
        };
      default:
        return {
          statusCode: 500,
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        };
    }
  }
}
