import { Module } from '@nestjs/common';
import { AppConfigModule } from '../app-config/app-config.module';
import { StorageModule } from '../storage/storage.module';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

@Module({
  imports: [StorageModule, AppConfigModule],
  controllers: [HistoryController],
  providers: [HistoryService],
})
export class HistoryModule {}
