import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Rahul' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'rahul@example.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @IsInt()
  age?: number;

  @ApiPropertyOptional({ example: 'Love music and travel' })
  @IsOptional()
  @IsString()
  about?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.jpg' })
  @IsOptional()
  @IsString()
  avatar_url?: string;
}

export class UpdateLanguagesDto {
  @ApiProperty({ example: [1, 2, 3], type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  language_ids: number[];
}

export class OnlineStatusDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  is_online: boolean;
}

export class UpdateDeviceDto {
  @ApiProperty({ example: 'device-uuid-abc123' })
  @IsString()
  device_id: string;

  @ApiPropertyOptional({ example: 'fcm-token-xyz' })
  @IsOptional()
  @IsString()
  fcm_token?: string;
}
