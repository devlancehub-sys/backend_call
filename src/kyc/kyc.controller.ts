import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { KycService } from './kyc.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('kyc')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('female')
export class KycController {
  constructor(private kycService: KycService) {}

  @Get('status')
  getStatus(@Req() req: any) {
    return this.kycService.getStatus(req.user.id);
  }

  @Post('submit')
  submit(@Req() req: any, @Body() body: { type: string; document_url: string }) {
    return this.kycService.submit(req.user.id, body.type, body.document_url);
  }
}
