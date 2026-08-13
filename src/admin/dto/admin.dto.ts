import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AdminLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class CreateCreatorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  coinPrice!: number;
}

export class UpdateCreatorDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  coinPrice?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
