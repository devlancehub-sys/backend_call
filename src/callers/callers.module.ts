import { Module } from '@nestjs/common';
import { CallersController } from './callers.controller';
import { CallersService } from './callers.service';

@Module({
  controllers: [CallersController],
  providers: [CallersService],
})
export class CallersModule {}
