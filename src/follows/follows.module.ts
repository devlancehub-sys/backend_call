import { Module } from '@nestjs/common';
import { FollowsService } from './follows.service';
import { FollowsController } from './follows.controller';
import { DatabaseModule } from '../database/database.module';
import { PushModule } from '../common/push.module';

@Module({
  imports: [DatabaseModule, PushModule],
  controllers: [FollowsController],
  providers: [FollowsService],
  exports: [FollowsService],
})
export class FollowsModule {}
