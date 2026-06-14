import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class EndCallDto {
  @ApiProperty({ example: 42 })
  @IsInt()
  @Min(1)
  call_id: number;
}
