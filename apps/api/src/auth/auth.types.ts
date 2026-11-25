import { Role } from '@prisma/client';

/** Claims carried in the signed JWT. */
export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: Role;
}

/** The authenticated principal attached to each request by JwtAuthGuard. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export const AUTH_COOKIE_NAME = 'cargoflow_session';
