import { ArgumentsHost, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter, ErrorResponseBody } from './all-exceptions.filter';
import { bodyParserErrorMiddleware, toBodyParserDomainError } from './body-parser-errors';
import { DomainError } from './domain-error';

function run(exception: unknown): { status: number; body: ErrorResponseBody } {
  let status = 0;
  let body: ErrorResponseBody | undefined;
  const response = {
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: ErrorResponseBody) {
      body = payload;
    },
  };
  const request = { method: 'POST', path: '/api/x', originalUrl: '/api/x?y=1', url: '/api/x?y=1' };
  const host = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status, body: body! };
}

describe('AllExceptionsFilter', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));

  it('maps DomainErrors to their status, code and details', () => {
    const { status, body } = run(
      new DomainError('CONTAINER_UNAVAILABLE', 'busy', [{ field: 'containerId', messages: ['x'] }]),
    );
    expect(status).toBe(409);
    expect(body).toMatchObject({
      statusCode: 409,
      error: 'CONFLICT',
      code: 'CONTAINER_UNAVAILABLE',
      message: 'busy',
      details: [{ field: 'containerId', messages: ['x'] }],
      path: '/api/x?y=1',
    });
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('maps Nest HttpExceptions to stable codes', () => {
    expect(run(new NotFoundException('gone')).body).toMatchObject({
      code: 'NOT_FOUND',
      message: 'gone',
    });
    expect(run(new BadRequestException(['a', 'b'])).body.message).toBe('a; b');
  });

  it('replaces the throttler message with a friendly one', () => {
    const { status, body } = run(new ThrottlerException());
    expect(status).toBe(429);
    expect(body.message).toBe('Too many requests. Please try again later.');
  });

  it('maps Prisma unique violations to 409 without leaking metadata', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed on SQL ...', {
      code: 'P2002',
      clientVersion: 'x',
      meta: { target: ['companyName'] },
    });
    const { status, body } = run(error);
    expect(status).toBe(409);
    expect(body).toMatchObject({
      code: 'DUPLICATE_RESOURCE',
      details: { fields: ['companyName'] },
    });
    expect(JSON.stringify(body)).not.toMatch(/SQL/);
  });

  it('hides unknown errors behind a generic 500', () => {
    const { status, body } = run(new Error('SELECT * FROM secret_table failed'));
    expect(status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toMatch(/secret_table/);
  });

  it('maps raw body-parser errors instead of answering 500', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      type: 'entity.too.large',
      status: 413,
    });
    expect(run(tooLarge)).toMatchObject({ status: 413, body: { code: 'PAYLOAD_TOO_LARGE' } });
  });
});

describe('body-parser error mapping', () => {
  it.each([
    ['entity.parse.failed', 'MALFORMED_REQUEST_BODY', 400],
    ['request.aborted', 'MALFORMED_REQUEST_BODY', 400],
    ['entity.too.large', 'PAYLOAD_TOO_LARGE', 413],
    ['charset.unsupported', 'UNSUPPORTED_MEDIA_TYPE', 415],
    ['encoding.unsupported', 'UNSUPPORTED_MEDIA_TYPE', 415],
  ])('%s → %s (%d)', (type, code, status) => {
    const mapped = toBodyParserDomainError({ type });
    expect(mapped?.code).toBe(code);
    expect(mapped?.httpStatus).toBe(status);
  });

  it('ignores unrelated errors', () => {
    expect(toBodyParserDomainError(new Error('x'))).toBeUndefined();
    expect(toBodyParserDomainError(null)).toBeUndefined();
  });

  it('middleware forwards a DomainError for parser failures and passes others through', () => {
    const next = jest.fn();
    const syntax = Object.assign(new SyntaxError('Unexpected token'), {
      type: 'entity.parse.failed',
    });
    bodyParserErrorMiddleware(syntax, {} as never, {} as never, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(DomainError);

    const other = new Error('other');
    bodyParserErrorMiddleware(other, {} as never, {} as never, next);
    expect(next.mock.calls[1][0]).toBe(other);
  });
});
