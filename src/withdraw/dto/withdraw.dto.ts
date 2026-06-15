import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsObject, IsString, Min } from 'class-validator';

export class WithdrawRequestDto {
  @ApiProperty({ example: 1000 })
  @Type(() => Number)
  @IsNumber()
  @Min(100)
  amount: number;

  @ApiProperty({ example: 'upi' })
  @IsString()
  method: string;

  @ApiProperty({ example: { upi_id: 'user@paytm' } })
  @IsObject()
  account_details: Record<string, unknown>;
}
