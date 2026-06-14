import { IsInt, Min } from 'class-validator';

export class CallTokenDto {
  @IsInt()
  @Min(1)
  call_id: number;
}
