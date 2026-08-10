import { Module } from '@nestjs/common';
import { AppConfigModule } from '../app-config/app-config.module';
import { StorageModule } from '../storage/storage.module';
import { WalletModule } from '../wallet/wallet.module';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [WalletModule, StorageModule, AppConfigModule],
  controllers: [VideosController],
  providers: [VideosService],
})
export class VideosModule {}
