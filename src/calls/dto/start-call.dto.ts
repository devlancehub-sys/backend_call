import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class StartCallDto {
  @ApiPropertyOptional({ example: 12, description: 'Required when caller is male' })
  @IsOptional()
  @IsInt()
  @Min(1)
  host_id?: number;

  @ApiPropertyOptional({ example: 5, description: 'Required when caller is female' })
  @IsOptional()
  @IsInt()
  @Min(1)
  caller_id?: number;
}
