import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminHostsController, HostAuthController } from './host-auth.controller';
import { HostAuthService } from './host-auth.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [HostAuthController, AdminHostsController],
  providers: [HostAuthService],
})
export class HostAuthModule {}
