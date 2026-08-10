import { Module } from '@nestjs/common';
import { AppConfigController } from './app-config.controller';
import { AppSettingsService } from './app-settings.service';

@Module({
  controllers: [AppConfigController],
  providers: [AppSettingsService],
  exports: [AppSettingsService],
})
export class AppConfigModule {}
