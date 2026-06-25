import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsIn, IsObject } from 'class-validator';
import { RECORD_STATUS } from '../../common/constants/record-status';

export class UpdateSettingsDto {
  @ApiProperty({
    example: { COMMISSION_PERCENTAGE: '40', MIN_RECHARGE: '100' },
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsObject()
  settings: Record<string, string>;
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: ['inactive', 'active', 'disabled'], example: 'active' })
  @IsIn([RECORD_STATUS.INACTIVE, RECORD_STATUS.ACTIVE, RECORD_STATUS.DISABLED])
  status: 'inactive' | 'active' | 'disabled';
}

export class PurgeUserDataDto {
  @ApiProperty({ example: 'DELETE_ALL_USER_DATA' })
  @Equals('DELETE_ALL_USER_DATA')
  confirm: 'DELETE_ALL_USER_DATA';
}
