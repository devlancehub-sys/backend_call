import { Module } from '@nestjs/common';
import { CallersController } from './callers.controller';
import { CallersService } from './callers.service';
import { SocketModule } from '../socket/socket.module';

@Module({
  imports: [SocketModule],
  controllers: [CallersController],
  providers: [CallersService],
})
export class CallersModule {}
