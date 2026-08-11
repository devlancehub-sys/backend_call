import { Type } from 'class-transformer';
import { IsNumber, IsPositive, IsString, IsNotEmpty } from 'class-validator';

export class CreateRechargeDto {
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amountInr!: number;
}

export class VerifyRechargeDto {
  @IsString()
  @IsNotEmpty()
  razorpayOrderId!: string;

  @IsString()
  @IsNotEmpty()
  razorpayPaymentId!: string;

  @IsString()
  @IsNotEmpty()
  razorpaySignature!: string;
}
