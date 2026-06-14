import { IsInt, IsOptional, Min } from 'class-validator';

export class StartCallDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  host_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  caller_id?: number;
}
