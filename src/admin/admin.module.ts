import { Module } from '@nestjs/common';
import { HostAccessKeyModule } from '../host-access-key/host-access-key.module';
import { SocketModule } from '../socket/socket.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [HostAccessKeyModule, SocketModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
