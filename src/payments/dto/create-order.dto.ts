import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, IsString, IsOptional } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ example: 500, description: 'Amount in paise (minimum 100)' })
  @IsInt()
  @Min(100)
  amount: number;

  @ApiProperty({ example: 'INR', description: 'Currency code' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiProperty({ example: 'receipt_123', description: 'Receipt identifier' })
  @IsString()
  @IsOptional()
  receipt?: string;
}
