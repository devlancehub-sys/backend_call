import { Module } from '@nestjs/common';
import { HostAccessKeyModule } from '../host-access-key/host-access-key.module';
import { SocketModule } from '../socket/socket.module';
import { CallsModule } from '../calls/calls.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [HostAccessKeyModule, SocketModule, CallsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
// This module is used to manage the admin panel.
// It is used to manage the admin panel.
// It is used to manage the admin panel.