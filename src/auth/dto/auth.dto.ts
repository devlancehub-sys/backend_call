import { IsString, IsOptional, IsIn } from 'class-validator';

export class SendOtpDto {
  @IsString()
  phone: string;
}

export class VerifyOtpDto {
  @IsString()
  phone: string;

  @IsString()
  otp: string;

  @IsIn(['male', 'female'])
  role: 'male' | 'female';

  @IsOptional()
  @IsString()
  device_id?: string;

  @IsOptional()
  @IsString()
  fcm_token?: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}
