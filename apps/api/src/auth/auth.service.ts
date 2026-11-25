import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { Clock } from '../common/clock';
import { APP_ENV, AppEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './auth.types';
import { PublicUserDto } from './dto';

export const PASSWORD_HASH_ROUNDS = 12;

// Compared against when the email is unknown so both branches take similar time,
// making account enumeration through response timing harder.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), PASSWORD_HASH_ROUNDS);

export function toPublicUser(
  user: Pick<User, 'id' | 'fullName' | 'email' | 'role'>,
): PublicUserDto {
  return { id: user.id, fullName: user.fullName, email: user.email, role: user.role };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly clock: Clock,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.fullName,
      role: user.role,
    };
    const accessToken = await this.jwt.signAsync(payload);
    const expiresAt = new Date(
      this.clock.now().getTime() + this.env.JWT_EXPIRES_IN_SECONDS * 1000,
    ).toISOString();

    return { user: toPublicUser(user), accessToken, expiresAt };
  }

  async getProfile(userId: string): Promise<PublicUserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    // A valid token for a user that no longer exists is treated as an invalid session.
    if (!user) throw new UnauthorizedException('Session is no longer valid.');
    return toPublicUser(user);
  }
}
