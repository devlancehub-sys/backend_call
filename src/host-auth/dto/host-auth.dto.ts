import { IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';

export class HostLoginDto {
  @IsString()
  username: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  device_id?: string;

  @IsOptional()
  @IsString()
  fcm_token?: string;
}

export class CreateHostDto {
  @IsString()
  @Length(3, 50)
  username: string;

  @IsString()
  @Length(4, 100)
  password: string;

  @IsString()
  @Length(2, 100)
  name: string;

  @IsOptional()
  @ValidateIf((o) => o.phone && o.phone.length > 0)
  @IsString()
  @Matches(/^[6-9]\d{9}$/, { message: 'Enter valid 10-digit phone' })
  phone?: string;
}
