import { Injectable } from '@nestjs/common';
import { RowDataPacket } from 'mysql2';
import { AppSettingsService } from '../app-config/app-settings.service';
import { DatabaseService } from '../database/database.service';
import { R2StorageService } from '../storage/r2-storage.service';
import {
  paginate,
  paginationOffset,
  PaginatedResult,
} from '../common/dto/pagination.dto';

interface UnlockHistoryRow extends RowDataPacket {
  id: number;
  girl_id: number;
  girl_name: string;
  coins_spent: number;
  thumbnail_key: string | null;
  created_at: Date;
}

interface RechargeHistoryRow extends RowDataPacket {
  id: number;
  amount_inr: number;
  coins_added: number;
  status: string;
  created_at: Date;
}

@Injectable()
export class HistoryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: R2StorageService,
    private readonly settings: AppSettingsService,
  ) {}

  async getHistory(userId: number, page: number, limit: number) {
    const ttl = this.settings.getSignedUrlTtl();

    const unlocks = await this.fetchUnlocks(userId, page, limit, ttl);
    const recharges = await this.fetchRecharges(userId, page, limit);

    return { unlocks, recharges };
  }

  private async fetchUnlocks(
    userId: number,
    page: number,
    limit: number,
    ttl: number,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const offset = paginationOffset(page, limit);

    const [countRows] = await this.db.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM video_unlocks WHERE user_id = ?',
      [userId],
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await this.db.query<UnlockHistoryRow[]>(
      `SELECT vu.id, vu.girl_id, g.name AS girl_name, vu.coins_spent,
              g.thumbnail_key, vu.created_at
       FROM video_unlocks vu
       JOIN girls g ON g.id = vu.girl_id
       WHERE vu.user_id = ?
       ORDER BY vu.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset],
    );

    const data = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        girlId: row.girl_id,
        girlName: row.girl_name,
        coinsSpent: row.coins_spent,
        thumbnailUrl: row.thumbnail_key
          ? await this.storage.getSignedUrl(row.thumbnail_key, ttl)
          : null,
        createdAt: row.created_at.toISOString(),
      })),
    );

    return paginate(data, page, limit, total);
  }

  private async fetchRecharges(
    userId: number,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const offset = paginationOffset(page, limit);

    const [countRows] = await this.db.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM recharge_history WHERE user_id = ?',
      [userId],
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await this.db.query<RechargeHistoryRow[]>(
      `SELECT id, amount_inr, coins_added, status, created_at
       FROM recharge_history
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset],
    );

    const data = rows.map((row) => ({
      id: row.id,
      amountInr: Number(row.amount_inr),
      coinsAdded: row.coins_added,
      status: row.status,
      createdAt: row.created_at.toISOString(),
    }));

    return paginate(data, page, limit, total);
  }
}
