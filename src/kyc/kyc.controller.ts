import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { KycService } from './kyc.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { KycSubmitDto } from './dto/kyc.dto';

@ApiTags('KYC')
@ApiBearerAuth('JWT')
@Controller('kyc')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('female')
export class KycController {
  constructor(private kycService: KycService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get KYC verification status — girls only' })
  getStatus(@Req() req: any) {
    return this.kycService.getStatus(req.user.id);
  }

  @Post('submit')
  @ApiOperation({ summary: 'Submit KYC document — girls only' })
  submit(@Req() req: any, @Body() body: KycSubmitDto) {
    return this.kycService.submit(req.user.id, body.type, body.document_url);
  }
}
