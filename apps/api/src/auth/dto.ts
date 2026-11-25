import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@cargoflow.local' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(191)
  email!: string;

  @ApiProperty({ example: 'CargoFlow!2026' })
  @IsString()
  @MinLength(1, { message: 'password is required' })
  @MaxLength(128)
  password!: string;
}

export class PublicUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: Role }) role!: Role;
}

export class LoginResponseDto {
  @ApiProperty({ type: PublicUserDto }) user!: PublicUserDto;
  @ApiProperty({ description: 'Bearer token for non-browser API clients' }) accessToken!: string;
  @ApiProperty({ description: 'Token expiry (ISO-8601, UTC)' }) expiresAt!: string;
}
