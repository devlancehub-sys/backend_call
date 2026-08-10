import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from './database/database.service';

@Controller()
export class AppController {
  constructor(private readonly db: DatabaseService) {}

  @Get('health')
  async health() {
    const connected = await this.db.ping();
    return {
      status: 'ok',
      database: connected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
      service: 'premium-status-api',
    };
  }
}
