import { Module } from '@nestjs/common';
import { CallsController } from './calls.controller';
import { CallController } from './call.controller';
import { CallsService } from './calls.service';
import { SocketModule } from '../socket/socket.module';
import { ZegoTokenService } from '../zego/zego-token.service';

@Module({
  imports: [SocketModule],
  controllers: [CallsController, CallController],
  providers: [CallsService, ZegoTokenService],
  exports: [CallsService, ZegoTokenService],
})
export class CallsModule {}
