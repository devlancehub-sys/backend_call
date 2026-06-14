import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { PlatformSettingsService } from '../common/services/platform-settings.service';

@Global()
@Module({
  providers: [DatabaseService, PlatformSettingsService],
  exports: [DatabaseService, PlatformSettingsService],
})
export class DatabaseModule {}
