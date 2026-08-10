import { Controller, Get } from '@nestjs/common';
import { AppSettingsService } from './app-settings.service';

@Controller('app-config')
export class AppConfigController {
  constructor(private readonly settings: AppSettingsService) {}

  @Get()
  async getConfig() {
    const girlsVersion = await this.settings.getGirlsVersion();
    return { girlsVersion };
  }
}
