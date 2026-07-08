import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { HostTierService } from './host-tier.service';
import { ChangeTierDto, TierInfoDto, TierProgressDto } from './dto/tier.dto';

@Controller('host')
@UseGuards(JwtAuthGuard)
export class TierController {
  constructor(private readonly tierService: HostTierService) {}

  @Get('tier')
  async getTierInfo(@Request() req): Promise<{ success: boolean; data: TierInfoDto }> {
    const tierInfo = await this.tierService.getTierInfo(req.user.id);
    return { success: true, data: tierInfo };
  }

  @Get('tier-progress')
  async getTierProgress(@Request() req): Promise<{ success: boolean; data: TierProgressDto }> {
    const tierProgress = await this.tierService.getTierProgress(req.user.id);
    return { success: true, data: tierProgress };
  }

  @Post('change-tier')
  async changeTier(@Request() req, @Body() dto: ChangeTierDto): Promise<{ success: boolean; message: string }> {
    await this.tierService.changeTier(req.user.id, dto);
    return { success: true, message: 'Tier changed successfully' };
  }
}
