import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HostTierService } from './host-tier.service';

/** Runs after midnight — recalculates creator talk minutes and tier thresholds. */
@Injectable()
export class HostTierCronService {
  private readonly logger = new Logger(HostTierCronService.name);
  private running = false;

  constructor(private readonly tierService: HostTierService) {}

  /** Daily at 00:00 (default Asia/Kolkata — set CRON_TIMEZONE to override). */
  @Cron('0 0 * * *', {
    name: 'host-tier-daily-reconcile',
    timeZone: process.env.CRON_TIMEZONE || 'Asia/Kolkata',
  })
  async reconcileHostTiersAtMidnight() {
    await this.runReconcile('cron');
  }

  private async runReconcile(source: string) {
    if (this.running) {
      this.logger.warn(`Host tier reconcile skipped (${source}) — already running`);
      return;
    }

    this.running = true;
    try {
      const { hosts_updated } = await this.tierService.reconcileAllHostTalkTotals();
      this.logger.log(
        `Host tier reconcile (${source}): ${hosts_updated} host profile(s) updated from call history`,
      );
    } catch (err) {
      this.logger.error(
        `Host tier reconcile failed (${source}): ${(err as Error)?.message || err}`,
      );
    } finally {
      this.running = false;
    }
  }
}
