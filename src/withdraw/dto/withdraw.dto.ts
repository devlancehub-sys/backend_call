import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsObject, IsString, Min } from 'class-validator';

export class WithdrawRequestDto {
  @ApiProperty({ example: 1000 })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({ example: 'upi' })
  @IsString()
  method: string;

  @ApiProperty({ example: { upi_id: 'user@paytm' } })
  @IsObject()
  account_details: Record<string, unknown>;
}
