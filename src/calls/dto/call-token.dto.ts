import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class CallTokenDto {
  @ApiProperty({ example: 42 })
  @IsInt()
  @Min(1)
  call_id: number;
}
