import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class PlatformSettingsService implements OnModuleInit {
  private cache: Record<string, string> = {};

  constructor(
    private db: DatabaseService,
    private config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.refresh();
  }

  async refresh() {
    try {
      const rows = await this.db.query<{ setting_key: string; setting_value: string }[]>(
        'SELECT setting_key, setting_value FROM platform_settings',
      );
      this.cache = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
    } catch {
      this.cache = {};
    }
  }

  get(key: string, envFallback?: string): string {
    if (this.cache[key] !== undefined) return this.cache[key];
    if (envFallback !== undefined) return this.config.get(envFallback, '') as string;
    return '';
  }

  getNumber(key: string, envFallback: string, defaultValue: number): number {
    const raw = this.get(key, envFallback);
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }

  getCommissionPercentage(): number {
    return this.getStandardCommissionPercentage();
  }

  getPromotedCommissionPercentage(): number {
    return this.getStandardCommissionPercentage();
  }

  getStandardCommissionPercentage(): number {
    return this.getNumber('standard_commission_percentage', 'STANDARD_COMMISSION_PERCENTAGE', 50);
  }

  getDefaultHostRate(): number {
    return this.getNumber('default_host_rate', 'DEFAULT_HOST_RATE', 6);
  }
}
