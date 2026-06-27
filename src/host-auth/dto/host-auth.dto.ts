import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Min, ValidateIf } from 'class-validator';

export class HostLoginDto {
  @ApiProperty({ example: 'priya_host' })
  @IsString()
  username: string;

  @ApiProperty({ example: 'secret123' })
  @IsString()
  password: string;

  @ApiPropertyOptional({ example: 'device-uuid-abc123' })
  @IsOptional()
  @IsString()
  device_id?: string;

  @ApiPropertyOptional({ example: 'fcm-token-xyz' })
  @IsOptional()
  @IsString()
  fcm_token?: string;
}

export class CreateHostDto {
  @ApiProperty({ example: 'priya_host', minLength: 3, maxLength: 50 })
  @IsString()
  @Length(3, 50)
  username: string;

  @ApiProperty({ example: 'secret123', minLength: 4, maxLength: 100 })
  @IsString()
  @Length(4, 100)
  password: string;

  @ApiProperty({ example: 'Priya', minLength: 2, maxLength: 100 })
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @ValidateIf((o) => o.phone && o.phone.length > 0)
  @IsString()
  @Matches(/^[6-9]\d{9}$/, { message: 'Enter valid 10-digit phone' })
  phone?: string;
}

export class VerifyAccessKeyDto {
  @ApiProperty({ example: 'hak_abc123...' })
  @IsString()
  @Length(10, 255)
  access_key: string;

  @ApiPropertyOptional({ example: 1, description: 'Cached profile version from the app' })
  @IsOptional()
  @IsInt()
  @Min(0)
  profile_version?: number;
}

export class SendHostOtpDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(/^[6-9]\d{9}$/, { message: 'Enter valid 10-digit mobile number' })
  phone: string;
}

export class VerifyHostOtpDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(/^[6-9]\d{9}$/, { message: 'Enter valid 10-digit mobile number' })
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(4, 8)
  otp: string;

  @ApiPropertyOptional({ example: 'device-uuid-abc123' })
  @IsOptional()
  @IsString()
  device_id?: string;

  @ApiPropertyOptional({ example: 'fcm-token-xyz' })
  @IsOptional()
  @IsString()
  fcm_token?: string;
}

export class SetHostAvailabilityDto {
  @ApiProperty({ enum: ['available', 'busy', 'offline'] })
  @IsString()
  @Matches(/^(available|busy|offline)$/)
  status: 'available' | 'busy' | 'offline';
}

export class SetHostRateDto {
  @ApiProperty({ enum: [6, 12, 18, 24], description: 'Creator earning tier per minute' })
  @IsInt()
  @IsIn([6, 12, 18, 24])
  earning_rate: 6 | 12 | 18 | 24;
}

export class SetHostFreeCallOfferDto {
  @ApiProperty({ description: 'Offer 1 free minute to eligible new callers on this device' })
  @IsBoolean()
  offers_free_call: boolean;
}
