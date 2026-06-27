import { Module } from '@nestjs/common';
import { HostAccessKeyModule } from '../host-access-key/host-access-key.module';
import { HostAuthModule } from '../host-auth/host-auth.module';
import { SocketModule } from '../socket/socket.module';
import { CallsModule } from '../calls/calls.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [HostAccessKeyModule, HostAuthModule, SocketModule, CallsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}