import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { HostAccessKeyModule } from '../host-access-key/host-access-key.module';
import { SocketModule } from '../socket/socket.module';
import { WalletModule } from '../wallet/wallet.module';
import { AdminHostsController, HostAuthController } from './host-auth.controller';
import { HostGirlsController } from './host-girls.controller';
import { HostAuthService } from './host-auth.service';
import { HostOtpService } from './host-otp.service';
import { HostAvailabilityService } from './host-availability.service';
import { HostWeeklyStatsService } from './host-weekly-stats.service';
import { HostRateService } from './host-rate.service';
import { HostLeaderboardService } from './host-leaderboard.service';

@Module({
  imports: [AuthModule, UsersModule, HostAccessKeyModule, SocketModule, WalletModule],
  controllers: [HostAuthController, AdminHostsController, HostGirlsController],
  providers: [
    HostAuthService,
    HostOtpService,
    HostAvailabilityService,
    HostWeeklyStatsService,
    HostRateService,
    HostLeaderboardService,
  ],
  exports: [
    HostAvailabilityService,
    HostWeeklyStatsService,
    HostRateService,
    HostLeaderboardService,
  ],
})
export class HostAuthModule {}
