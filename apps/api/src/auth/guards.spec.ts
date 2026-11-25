import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { AUTH_COOKIE_NAME, AuthenticatedUser, JwtPayload } from './auth.types';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';
import { JwtAuthGuard, RolesGuard } from './guards';

const SECRET = 'unit-test-secret-that-is-at-least-32-characters';

interface FakeRequest {
  headers: Record<string, string>;
  cookies?: Record<string, string>;
  user?: AuthenticatedUser;
}

function contextFor(request: FakeRequest, metadata: Record<string, unknown> = {}) {
  const handler = () => undefined;
  const reflector = new Reflector();
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((key: unknown) => metadata[key as string]);
  const context = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, reflector };
}

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({ secret: SECRET, signOptions: { algorithm: 'HS256' } });
  const payload: JwtPayload = { sub: 'u1', email: 'a@b.co', name: 'Ann', role: Role.OPERATIONS };

  it('lets @Public routes through without a token', async () => {
    const { context, reflector } = contextFor({ headers: {} }, { [IS_PUBLIC_KEY]: true });
    await expect(new JwtAuthGuard(jwt, reflector).canActivate(context)).resolves.toBe(true);
  });

  it('rejects requests without a token', async () => {
    const { context, reflector } = contextFor({ headers: {} });
    await expect(new JwtAuthGuard(jwt, reflector).canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts a bearer token and attaches the user', async () => {
    const token = await jwt.signAsync(payload);
    const request: FakeRequest = { headers: { authorization: `Bearer ${token}` } };
    const { context, reflector } = contextFor(request);
    await expect(new JwtAuthGuard(jwt, reflector).canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      id: 'u1',
      email: 'a@b.co',
      fullName: 'Ann',
      role: 'OPERATIONS',
    });
  });

  it('accepts the session cookie', async () => {
    const token = await jwt.signAsync(payload);
    const request: FakeRequest = { headers: {}, cookies: { [AUTH_COOKIE_NAME]: token } };
    const { context, reflector } = contextFor(request);
    await expect(new JwtAuthGuard(jwt, reflector).canActivate(context)).resolves.toBe(true);
  });

  it('rejects a token signed with another secret', async () => {
    const forged = await new JwtService({ secret: 'x'.repeat(40) }).signAsync(payload);
    const { context, reflector } = contextFor({ headers: { authorization: `Bearer ${forged}` } });
    await expect(new JwtAuthGuard(jwt, reflector).canActivate(context)).rejects.toThrow(
      /invalid or has expired/,
    );
  });

  it('rejects an expired token', async () => {
    const expired = await jwt.signAsync({ ...payload, exp: Math.floor(Date.now() / 1000) - 10 });
    const { context, reflector } = contextFor({ headers: { authorization: `Bearer ${expired}` } });
    await expect(new JwtAuthGuard(jwt, reflector).canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an unsigned (alg=none) token', async () => {
    const encode = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`;
    const { context, reflector } = contextFor({ headers: { authorization: `Bearer ${none}` } });
    await expect(new JwtAuthGuard(jwt, reflector).canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('RolesGuard', () => {
  const admin: AuthenticatedUser = { id: '1', email: 'a@x.co', fullName: 'A', role: Role.ADMIN };
  const ops: AuthenticatedUser = { id: '2', email: 'o@x.co', fullName: 'O', role: Role.OPERATIONS };

  it('allows any authenticated user when no roles are required', () => {
    const { context, reflector } = contextFor({ headers: {}, user: ops });
    expect(new RolesGuard(reflector).canActivate(context)).toBe(true);
  });

  it('allows a user whose role is listed', () => {
    const { context, reflector } = contextFor(
      { headers: {}, user: admin },
      { [ROLES_KEY]: [Role.ADMIN] },
    );
    expect(new RolesGuard(reflector).canActivate(context)).toBe(true);
  });

  it('forbids a user whose role is not listed', () => {
    const { context, reflector } = contextFor(
      { headers: {}, user: ops },
      { [ROLES_KEY]: [Role.ADMIN] },
    );
    expect(() => new RolesGuard(reflector).canActivate(context)).toThrow(ForbiddenException);
  });
});
