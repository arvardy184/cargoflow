import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateCustomerDto {
  @ApiProperty({ example: 'PT Nusantara Sinar Logistik' })
  @Transform(trim)
  @IsString()
  @Length(2, 150)
  companyName!: string;

  @ApiProperty({ example: 'Rina Wulandari' })
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  contactPerson!: string;

  @ApiProperty({ example: 'ops@nusantara-sinar.example' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(191)
  email!: string;

  @ApiProperty({ example: '+62 21 5550 1234' })
  @Transform(trim)
  @IsString()
  @Matches(/^\+?[0-9][0-9 ()-]{6,24}$/, {
    message:
      'phone must start with a digit or +, followed by digits, spaces, dashes or parentheses (7–25 characters)',
  })
  phone!: string;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

export class CustomerQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matches company name, contact person or email' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;
}
