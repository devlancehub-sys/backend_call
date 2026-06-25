import { Module } from '@nestjs/common';
import { CallsController } from './calls.controller';
import { CallController } from './call.controller';
import { CallsService } from './calls.service';
import { SocketModule } from '../socket/socket.module';
import { HostAuthModule } from '../host-auth/host-auth.module';
import { ZegoTokenService } from '../zego/zego-token.service';

@Module({
  imports: [SocketModule, HostAuthModule],
  controllers: [CallsController, CallController],
  providers: [CallsService, ZegoTokenService],
  exports: [CallsService, ZegoTokenService],
})
export class CallsModule {}
