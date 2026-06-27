import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { HostAccessKeyModule } from '../host-access-key/host-access-key.module';
import { SocketModule } from '../socket/socket.module';
import { AdminHostsController, HostAuthController } from './host-auth.controller';
import { HostGirlsController } from './host-girls.controller';
import { HostAuthService } from './host-auth.service';
import { HostOtpService } from './host-otp.service';
import { HostAvailabilityService } from './host-availability.service';
import { HostWeeklyStatsService } from './host-weekly-stats.service';
import { HostRateService } from './host-rate.service';
import { HostLeaderboardService } from './host-leaderboard.service';
import { HostTierService } from './host-tier.service';
import { HostTierCronService } from './host-tier-cron.service';

@Module({
  imports: [ScheduleModule.forRoot(), AuthModule, UsersModule, HostAccessKeyModule, SocketModule],
  controllers: [HostAuthController, AdminHostsController, HostGirlsController],
  providers: [
    HostAuthService,
    HostOtpService,
    HostAvailabilityService,
    HostWeeklyStatsService,
    HostRateService,
    HostLeaderboardService,
    HostTierService,
    HostTierCronService,
  ],
  exports: [
    HostAvailabilityService,
    HostWeeklyStatsService,
    HostRateService,
    HostLeaderboardService,
    HostTierService,
  ],
})
export class HostAuthModule {}
