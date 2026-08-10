import { Injectable, NotFoundException } from '@nestjs/common';
import { RowDataPacket } from 'mysql2';
import { AppSettingsService } from '../app-config/app-settings.service';
import { DatabaseService } from '../database/database.service';
import { R2StorageService } from '../storage/r2-storage.service';
import {
  paginate,
  paginationOffset,
  PaginatedResult,
} from '../common/dto/pagination.dto';

interface GirlListRow extends RowDataPacket {
  id: number;
  name: string;
  coin_price: number;
  status: 'active' | 'inactive';
  thumbnail_key: string | null;
}

interface GirlDetailRow extends GirlListRow {
  about: string | null;
  photo_key: string | null;
  video_duration: number | null;
  is_unlocked: number;
}

@Injectable()
export class GirlsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: R2StorageService,
    private readonly settings: AppSettingsService,
  ) {}

  async listGirls(
    userId: number,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const offset = paginationOffset(page, limit);
    const ttl = this.settings.getSignedUrlTtl();

    const [countRows] = await this.db.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM girls WHERE status = 'active'",
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await this.db.query<GirlListRow[]>(
      `SELECT id, name, coin_price, status, thumbnail_key
       FROM girls
       WHERE status = 'active'
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );

    const data = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        name: row.name,
        coinPrice: row.coin_price,
        status: row.status,
        thumbnailUrl: row.thumbnail_key
          ? await this.storage.getSignedUrl(row.thumbnail_key, ttl)
          : null,
      })),
    );

    return paginate(data, page, limit, total);
  }

  async getGirlDetail(userId: number, girlId: number) {
    const ttl = this.settings.getSignedUrlTtl();

    const [rows] = await this.db.query<GirlDetailRow[]>(
      `SELECT g.id, g.name, g.coin_price, g.status, g.about,
              g.thumbnail_key, g.photo_key,
              v.duration_seconds AS video_duration,
              CASE WHEN vu.id IS NULL THEN 0 ELSE 1 END AS is_unlocked
       FROM girls g
       LEFT JOIN videos v ON v.girl_id = g.id
       LEFT JOIN video_unlocks vu ON vu.girl_id = g.id AND vu.user_id = ?
       WHERE g.id = ?
       LIMIT 1`,
      [userId, girlId],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Creator not found');
    }

    return {
      id: row.id,
      name: row.name,
      coinPrice: row.coin_price,
      status: row.status,
      about: row.about,
      thumbnailUrl: row.thumbnail_key
        ? await this.storage.getSignedUrl(row.thumbnail_key, ttl)
        : null,
      profilePhotoUrl: row.photo_key
        ? await this.storage.getSignedUrl(row.photo_key, ttl)
        : null,
      isUnlocked: row.is_unlocked === 1,
      videoDurationSeconds: row.video_duration ?? 0,
    };
  }
}
