import { IsString, IsOptional, MinLength } from 'class-validator';

export class QuickLoginDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  device_id: string;

  @IsOptional()
  @IsString()
  fcm_token?: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}
