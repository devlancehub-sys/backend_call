import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { HostTierService } from './host-tier.service';
import { ChangeTierDto, TierInfoDto, TierProgressDto } from './dto/tier.dto';

@Controller('host')
@UseGuards(JwtAuthGuard)
export class TierController {
  constructor(private readonly tierService: HostTierService) {}

  @Get('tier')
  async getTierInfo(@Request() req): Promise<TierInfoDto> {
    return this.tierService.getTierInfo(req.user.id);
  }

  @Get('tier-progress')
  async getTierProgress(@Request() req): Promise<TierProgressDto> {
    return this.tierService.getTierProgress(req.user.id);
  }

  @Post('change-tier')
  async changeTier(@Request() req, @Body() dto: ChangeTierDto): Promise<void> {
    return this.tierService.changeTier(req.user.id, dto);
  }
}
