import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VerifyPaymentDto {
  @ApiProperty({ example: 'pay_abc123xyz' })
  @IsString()
  razorpay_payment_id: string;

  @ApiProperty({ example: 'order_abc123xyz' })
  @IsString()
  razorpay_order_id: string;

  @ApiProperty({ example: 'abc123xyz456' })
  @IsString()
  razorpay_signature: string;
}
