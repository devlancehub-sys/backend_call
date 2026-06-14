import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RechargeDto {
  @ApiProperty({ example: 500 })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({ example: 'razorpay' })
  @IsOptional()
  @IsString()
  gateway?: string;
}

export class ConfirmRechargeDto {
  @ApiProperty({ example: 'pay_abc123' })
  @IsString()
  payment_id: string;

  @ApiProperty({ example: 500 })
  @IsInt()
  @Min(1)
  amount: number;
}
