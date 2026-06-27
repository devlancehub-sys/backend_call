import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  buildHostTierProfile,
  hostTierFromDurationSeconds,
  HostTier,
} from '../common/utils/host-tier.util';

@Injectable()
export class HostTierService {
  constructor(private db: DatabaseService) {}

  async getTierProfile(hostId: number) {
    const seconds = await this.getTotalDurationSeconds(hostId);
    return { success: true, data: buildHostTierProfile(seconds) };
  }

  async getHostTier(hostId: number): Promise<HostTier> {
    const seconds = await this.getTotalDurationSeconds(hostId);
    return hostTierFromDurationSeconds(seconds);
  }

  /** Recompute lifetime talk seconds from ended calls — used by nightly cron. */
  async reconcileAllHostTalkTotals(): Promise<{ hosts_updated: number }> {
    const result = await this.db.query<any>(
      `UPDATE female_hosts fh
       LEFT JOIN (
         SELECT host_id, COALESCE(SUM(duration_seconds), 0) AS total_secs
         FROM calls
         WHERE status = 'ended'
         GROUP BY host_id
       ) agg ON agg.host_id = fh.user_id
       SET fh.total_duration_seconds = COALESCE(agg.total_secs, 0)`,
    );

    const hostsUpdated = Number((result as { affectedRows?: number })?.affectedRows ?? 0);
    return { hosts_updated: hostsUpdated };
  }

  private async getTotalDurationSeconds(hostId: number): Promise<number> {
    const rows = await this.db.query<{ total_duration_seconds: number }[]>(
      `SELECT total_duration_seconds FROM female_hosts WHERE user_id = ? LIMIT 1`,
      [hostId],
    );
    return Number(rows[0]?.total_duration_seconds ?? 0);
  }
}
