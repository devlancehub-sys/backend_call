import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from './database/database.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly db: DatabaseService) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check — API and database status' })
  async health() {
    const database = (await this.db.ping()) ? 'ok' : 'error';

    if (database !== 'ok') {
      throw new ServiceUnavailableException({
        status: 'error',
        message: 'service unavailable',
        service: 'love-call-nestjs-api',
        database,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ok',
      message: 'all okay',
      service: 'love-call-nestjs-api',
      database,
      timestamp: new Date().toISOString(),
    };
  }
}
