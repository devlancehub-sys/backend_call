import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from './database/database.service';
import { ZegoTokenService } from './zego/zego-token.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(
    private readonly db: DatabaseService,
    private readonly zego: ZegoTokenService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check — API, database, and ZEGOCLOUD status' })
  async health() {
    const database = (await this.db.ping()) ? 'ok' : 'error';
    const zegoConfigured = this.zego.isConfigured();

    if (database !== 'ok') {
      throw new ServiceUnavailableException({
        status: 'error',
        message: 'service unavailable',
        service: 'love-call-nestjs-api',
        database,
        zego: zegoConfigured ? 'ok' : 'not_configured',
        zego_app_id: zegoConfigured ? this.zego.appId : 0,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ok',
      message: 'all okay',
      service: 'love-call-nestjs-api',
      database,
      zego: zegoConfigured ? 'ok' : 'not_configured',
      zego_app_id: zegoConfigured ? this.zego.appId : 0,
      timestamp: new Date().toISOString(),
    };
  }
}
