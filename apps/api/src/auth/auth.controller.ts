import { Body, Controller, Get, HttpCode, Inject, Post, Res, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import { APP_ENV, AppEnv } from '../config/env';
import { AuthService } from './auth.service';
import { AUTH_COOKIE_NAME, AuthenticatedUser } from './auth.types';
import { CurrentUser, Public } from './decorators';
import { LoginDto, LoginResponseDto, PublicUserDto } from './dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Authenticate with email and password',
    description:
      'Sets an httpOnly session cookie for browser clients and also returns a bearer token for API clients. Rate limited per IP.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const result = await this.auth.login(dto.email, dto.password);
    res.cookie(AUTH_COOKIE_NAME, result.accessToken, {
      ...this.cookieOptions(),
      maxAge: this.env.JWT_EXPIRES_IN_SECONDS * 1000,
    });
    return result;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Clear the session cookie' })
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(AUTH_COOKIE_NAME, this.cookieOptions());
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Return the currently authenticated user' })
  @ApiOkResponse({ type: PublicUserDto })
  me(@CurrentUser() user: AuthenticatedUser): Promise<PublicUserDto> {
    return this.auth.getProfile(user.id);
  }

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: this.env.COOKIE_SECURE, path: '/' };
  }
}
