import type { NextFunction, Request, Response } from 'express';
import { DomainError } from './domain-error';

export const JSON_BODY_LIMIT = '100kb';

/**
 * Translates errors raised by the Express body parser (they carry a string `type`) into
 * DomainErrors with stable codes. Returns undefined for anything else.
 */
export function toBodyParserDomainError(error: unknown): DomainError | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  switch ((error as { type?: unknown }).type) {
    case 'entity.parse.failed':
      return new DomainError('MALFORMED_REQUEST_BODY', 'Request body is not valid JSON.');
    case 'request.aborted':
    case 'request.size.invalid':
      return new DomainError('MALFORMED_REQUEST_BODY', 'Request body could not be read.');
    case 'entity.too.large':
    case 'parameters.too.many':
      return new DomainError(
        'PAYLOAD_TOO_LARGE',
        `Request body exceeds the ${JSON_BODY_LIMIT} limit.`,
      );
    case 'charset.unsupported':
    case 'encoding.unsupported':
      return new DomainError('UNSUPPORTED_MEDIA_TYPE', 'Request body must be UTF-8 encoded JSON.');
    default:
      return undefined;
  }
}

/**
 * Express error middleware registered directly after the JSON parser. It must run before Nest's
 * own error handler, which would otherwise wrap parse failures in a BadRequestException that
 * exposes the raw JSON.parse message and loses the error type.
 */
export function bodyParserErrorMiddleware(
  error: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  next(toBodyParserDomainError(error) ?? error);
}
