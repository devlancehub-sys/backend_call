import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class KycSubmitDto {
  @ApiProperty({ example: 'aadhaar' })
  @IsString()
  type: string;

  @ApiProperty({ example: 'https://cdn.example.com/kyc/doc.jpg' })
  @IsString()
  document_url: string;
}
