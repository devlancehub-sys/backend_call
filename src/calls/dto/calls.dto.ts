import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class InitiateCallDto {
  @ApiProperty({ example: 12, description: 'Host (girl) user id' })
  @IsInt()
  @Min(1)
  host_id: number;
}

export class InitiateCallerDto {
  @ApiProperty({ example: 5, description: 'Caller (boy) user id' })
  @IsInt()
  @Min(1)
  caller_id: number;
}
