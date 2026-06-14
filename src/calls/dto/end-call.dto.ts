import { IsInt, Min } from 'class-validator';

export class EndCallDto {
  @IsInt()
  @Min(1)
  call_id: number;
}
