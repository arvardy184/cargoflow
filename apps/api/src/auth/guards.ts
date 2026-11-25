import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { AUTH_COOKIE_NAME, AuthenticatedUser, JwtPayload } from './auth.types';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';

type AuthRequest = Request & { user?: AuthenticatedUser };

/**
 * Global authentication guard. Accepts the JWT from either the httpOnly session cookie
 * (browser app) or an `Authorization: Bearer` header (API clients, Swagger, scripts).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = extractToken(request);
    if (!token) throw new UnauthorizedException('Authentication is required.');

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      request.user = {
        id: payload.sub,
        email: payload.email,
        fullName: payload.name,
        role: payload.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Session is invalid or has expired. Please sign in again.');
    }
  }
}

/** Global authorization guard; runs after JwtAuthGuard and checks @Roles metadata. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<AuthRequest>().user;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('You do not have permission to perform this action.');
    }
    return true;
  }
}

function extractToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim() || undefined;
  const cookies = request.cookies as Record<string, string> | undefined;
  return cookies?.[AUTH_COOKIE_NAME] || undefined;
}
