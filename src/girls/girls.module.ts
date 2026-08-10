import { Module } from '@nestjs/common';
import { AppConfigModule } from '../app-config/app-config.module';
import { StorageModule } from '../storage/storage.module';
import { GirlsController } from './girls.controller';
import { GirlsService } from './girls.service';

@Module({
  imports: [StorageModule, AppConfigModule],
  controllers: [GirlsController],
  providers: [GirlsService],
  exports: [GirlsService],
})
export class GirlsModule {}
