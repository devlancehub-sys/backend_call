import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { HostAccessKeyModule } from '../host-access-key/host-access-key.module';
import { AdminHostsController, HostAuthController } from './host-auth.controller';
import { HostAuthService } from './host-auth.service';

@Module({
  imports: [AuthModule, UsersModule, HostAccessKeyModule],
  controllers: [HostAuthController, AdminHostsController],
  providers: [HostAuthService],
})
export class HostAuthModule {}
