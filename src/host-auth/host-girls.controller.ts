import { Controller, Get, Put, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { HostAvailabilityService } from './host-availability.service';
import { HostDailyTaskService } from './host-daily-task.service';
import { SetHostAvailabilityDto } from './dto/host-auth.dto';

@ApiTags('Host')
@ApiBearerAuth('JWT')
@Controller('host')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('female')
export class HostGirlsController {
  constructor(
    private availability: HostAvailabilityService,
    private dailyTask: HostDailyTaskService,
  ) {}

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

  @Get('daily-task')
  @ApiOperation({ summary: 'Daily task progress — 6 calls OR 60 minutes for streak & reward' })
  getDailyTask(@Req() req: any) {
    return this.dailyTask.getProgress(req.user.id);
  }

  @Post('daily-task/claim-reward')
  @ApiOperation({ summary: 'Claim daily task reward after completing target' })
  claimDailyReward(@Req() req: any) {
    return this.dailyTask.claimReward(req.user.id);
  }

  @Post('daily-task/claim-weekly-bonus')
  @ApiOperation({ summary: 'Claim weekly bonus after completing daily task all 7 days' })
  claimWeeklyBonus(@Req() req: any) {
    return this.dailyTask.claimWeeklyBonus(req.user.id);
  }
}
