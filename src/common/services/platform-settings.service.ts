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
    return this.getNumber('commission_percentage', 'COMMISSION_PERCENTAGE', 40);
  }

  getDefaultHostRate(): number {
    return this.getNumber('default_host_rate', 'DEFAULT_HOST_RATE', 10);
  }

  getDailyMinCalls(): number {
    return this.getNumber('daily_min_calls', 'DAILY_MIN_CALLS', 6);
  }

  getDailyMinMinutes(): number {
    return this.getNumber('daily_min_minutes', 'DAILY_MIN_MINUTES', 60);
  }

  getDailyTaskReward(): number {
    return this.getNumber('daily_task_reward', 'DAILY_TASK_REWARD', 50);
  }

  getWeeklyTaskBonus(): number {
    return this.getNumber('weekly_task_bonus', 'WEEKLY_TASK_BONUS', 200);
  }
}
