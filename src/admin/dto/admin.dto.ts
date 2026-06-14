import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class UpdateSettingsDto {
  @ApiProperty({
    example: { COMMISSION_PERCENTAGE: '40', MIN_RECHARGE: '100' },
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsObject()
  settings: Record<string, string>;
}
