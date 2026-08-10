import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

export class UnlockVideoDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  girlId!: number;
}
