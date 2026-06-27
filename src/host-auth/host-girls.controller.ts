import { Controller, Get, Put, Body, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { HostAvailabilityService } from './host-availability.service';
import { HostWeeklyStatsService } from './host-weekly-stats.service';
import { HostRateService } from './host-rate.service';
import { HostLeaderboardService } from './host-leaderboard.service';
import { HostTierService } from './host-tier.service';
import { SetHostAvailabilityDto, SetHostRateDto } from './dto/host-auth.dto';

@ApiTags('Host')
@ApiBearerAuth('JWT')
@Controller('host')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('female')
export class HostGirlsController {
  constructor(
    private availability: HostAvailabilityService,
    private weeklyStats: HostWeeklyStatsService,
    private rateService: HostRateService,
    private leaderboard: HostLeaderboardService,
    private tierService: HostTierService,
  ) {}

  @Get('rate')
  @ApiOperation({ summary: 'Get creator rate tier and options (6/12/18/24)' })
  getRate(@Req() req: any) {
    return this.rateService.getRateProfile(req.user.id);
  }

  @Put('rate')
  @ApiOperation({ summary: 'Select creator earning rate tier before going available' })
  setRate(@Req() req: any, @Body() body: SetHostRateDto) {
    return this.rateService.setRate(req.user.id, body.earning_rate);
  }

  @Get('availability')
  @ApiOperation({ summary: 'Get host availability status (available / busy / offline)' })
  getAvailability(@Req() req: any) {
    return this.availability.getStatus(req.user.id);
  }

  @Put('availability')
  @ApiOperation({ summary: 'Set host availability — available receives calls, busy/offline do not' })
  setAvailability(@Req() req: any, @Body() body: SetHostAvailabilityDto) {
    return this.availability.setStatus(req.user.id, body.status);
  }

  @Get('tier')
  @ApiOperation({ summary: 'Creator level (Iron / Silver / Gold / Diamond) from talk minutes' })
  getTier(@Req() req: any) {
    return this.tierService.getTierProfile(req.user.id);
  }

  @Get('weekly-talk-time')
  @ApiOperation({ summary: 'Current week total talk time (Mon–Sun)' })
  getWeeklyTalkTime(@Req() req: any) {
    return this.weeklyStats.getCurrentWeekStats(req.user.id);
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Weekly creator leaderboard by talk time' })
  getLeaderboard() {
    return this.leaderboard.getCurrentWeekLeaderboard();
  }

  @Get('leaderboard/me')
  @ApiOperation({ summary: 'Current host weekly leaderboard rank' })
  getMyLeaderboardRank(@Req() req: any) {
    return this.leaderboard.getHostRank(req.user.id);
  }
}
