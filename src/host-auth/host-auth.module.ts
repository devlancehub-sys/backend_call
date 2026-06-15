import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminHostsController, HostAuthController } from './host-auth.controller';
import { HostAuthService } from './host-auth.service';

@Module({
  imports: [AuthModule],
  controllers: [HostAuthController, AdminHostsController],
  providers: [HostAuthService],
})
export class HostAuthModule {}
