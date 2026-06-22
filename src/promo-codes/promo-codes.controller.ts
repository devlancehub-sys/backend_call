import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PromoCodesService } from './promo-codes.service';
import {
  AssignPromoCodeDto,
  GeneratePromoCodeDto,
  PromoCodeActionDto,
} from './dto/promo-codes.dto';

@ApiTags('Promo Codes (Girls App)')
@ApiBearerAuth('JWT')
@Controller('promo-codes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('female')
export class PromoCodesController {
  constructor(private promoCodes: PromoCodesService) {}

  @Post('validate')
  @ApiOperation({ summary: 'Girls app — validate a promo code without redeeming' })
  validate(@Req() req: any, @Body() dto: PromoCodeActionDto) {
    return this.promoCodes.validate(req.user.id, dto);
  }

  @Post('apply')
  @ApiOperation({ summary: 'Girls app — redeem promo bonus to host wallet — single use only' })
  apply(@Req() req: any, @Body() dto: PromoCodeActionDto) {
    return this.promoCodes.apply(req.user.id, dto);
  }
}

@ApiTags('Admin Promo Codes')
@ApiSecurity('admin-key')
@Controller('admin/promo-codes')
@UseGuards(AdminApiKeyGuard)
export class AdminPromoCodesController {
  constructor(private promoCodes: PromoCodesService) {}

  @Get()
  @ApiOperation({ summary: 'List all promo codes' })
  list() {
    return this.promoCodes.list();
  }

  @Post('generate')
  @ApiOperation({ summary: 'Generate a user-specific promo bonus code for a girl host' })
  generate(@Body() dto: GeneratePromoCodeDto) {
    return this.promoCodes.generate(dto);
  }

  @Post('assign')
  @ApiOperation({ summary: 'Assign an existing promo code to a user' })
  assign(@Body() dto: AssignPromoCodeDto) {
    return this.promoCodes.assign(dto);
  }
}
