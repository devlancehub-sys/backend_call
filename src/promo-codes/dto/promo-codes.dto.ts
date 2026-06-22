import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsPositive, IsString, Length, Min } from 'class-validator';

export class GeneratePromoCodeDto {
  @ApiProperty({ example: 100, description: 'Bonus amount in INR — credited to host wallet' })
  @IsNumber()
  @IsPositive()
  bonus_amount: number;

  @ApiProperty({ example: '2026-12-31T23:59:59.000Z' })
  @IsString()
  expiry_date: string;

  @ApiProperty({ example: 12, description: 'Girl host user ID — only this user can redeem' })
  @IsInt()
  @Min(1)
  user_id: number;

  @ApiPropertyOptional({ example: 'BONUS-PRIYA-2026' })
  @IsOptional()
  @IsString()
  @Length(4, 50)
  promo_code?: string;
}

export class AssignPromoCodeDto {
  @ApiProperty({ example: 'BONUS-PRIYA-2026' })
  @IsString()
  @Length(4, 50)
  promo_code: string;

  @ApiProperty({ example: 12 })
  @IsInt()
  @Min(1)
  user_id: number;
}

export class PromoCodeActionDto {
  @ApiProperty({ example: 'BONUS-PRIYA-2026' })
  @IsString()
  @Length(4, 50)
  promo_code: string;
}
