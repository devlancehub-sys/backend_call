import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class InitiateCallDto {
  @ApiProperty({ example: 12, description: 'Host (girl) user id' })
  @IsInt()
  @Min(1)
  host_id: number;

  @ApiPropertyOptional({
    description: 'Apply free 1-minute bonus when eligible (Iron host only)',
  })
  @IsOptional()
  @IsBoolean()
  use_free_call?: boolean;
}

export class InitiateCallerDto {
  @ApiProperty({ example: 5, description: 'Caller (boy) user id' })
  @IsInt()
  @Min(1)
  caller_id: number;
}
