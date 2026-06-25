import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { HostAccessKeyModule } from '../host-access-key/host-access-key.module';
import { SocketModule } from '../socket/socket.module';
import { AdminHostsController, HostAuthController } from './host-auth.controller';
import { HostGirlsController } from './host-girls.controller';
import { HostAuthService } from './host-auth.service';
import { HostOtpService } from './host-otp.service';
import { HostAvailabilityService } from './host-availability.service';
import { HostDailyTaskService } from './host-daily-task.service';

@Module({
  imports: [AuthModule, UsersModule, HostAccessKeyModule, SocketModule],
  controllers: [HostAuthController, AdminHostsController, HostGirlsController],
  providers: [HostAuthService, HostOtpService, HostAvailabilityService, HostDailyTaskService],
  exports: [HostAvailabilityService, HostDailyTaskService],
})
export class HostAuthModule {}
