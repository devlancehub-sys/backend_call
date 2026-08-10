import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RowDataPacket } from 'mysql2';
import { DatabaseService } from '../database/database.service';

interface SettingRow extends RowDataPacket {
  setting_value: string;
}

@Injectable()
export class AppSettingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async getGirlsVersion(): Promise<number> {
    const [rows] = await this.db.query<SettingRow[]>(
      'SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1',
      ['girlsVersion'],
    );
    const value = rows[0]?.setting_value;
    return value ? parseInt(value, 10) : 1;
  }

  async bumpGirlsVersion(): Promise<number> {
    await this.db.query(
      `INSERT INTO app_settings (setting_key, setting_value)
       VALUES ('girlsVersion', '1')
       ON DUPLICATE KEY UPDATE setting_value = CAST(setting_value AS UNSIGNED) + 1`,
    );
    return this.getGirlsVersion();
  }

  getSignedUrlTtl(): number {
    return this.config.get<number>('SIGNED_URL_TTL_SECONDS', 3600);
  }

  getCoinsPerInr(): number {
    return this.config.get<number>('COINS_PER_INR', 10);
  }
}
