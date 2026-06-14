import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from './database/database.service';

@Controller()
export class AppController {
  constructor(private readonly db: DatabaseService) {}

  @Get('health')
  async health() {
    let database = 'ok';

    try {
      const pool = this.db.getPool();
      const conn = await pool.getConnection();
      await conn.ping();
      conn.release();
    } catch {
      database = 'error';
    }

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
