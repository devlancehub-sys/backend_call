import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { AppSettingsService } from '../app-config/app-settings.service';
import { DatabaseService } from '../database/database.service';
import { R2StorageService } from '../storage/r2-storage.service';
import { WalletService } from '../wallet/wallet.service';
import {
  paginate,
  paginationOffset,
  PaginatedResult,
} from '../common/dto/pagination.dto';
import {
  AdminLoginDto,
  CreateCreatorDto,
  UpdateCreatorDto,
} from './dto/admin.dto';
import {
  assertUploadFile,
  extensionForMime,
  PHOTO_UPLOAD_RULES,
  THUMBNAIL_UPLOAD_RULES,
  VIDEO_UPLOAD_RULES,
} from '../common/utils/upload.util';

interface AdminRow extends RowDataPacket {
  id: number;
  email: string;
  password_hash: string;
  name: string;
}

interface CreatorRow extends RowDataPacket {
  id: number;
  name: string;
  coin_price: number;
  status: 'active' | 'inactive';
  thumbnail_key: string | null;
  photo_key: string | null;
  created_at: Date;
}

interface AdminVideoRow extends RowDataPacket {
  
  id: number;
  girl_id: number;
  storage_key: string;
  duration_seconds: number;
  created_at: Date;
  updated_at: Date;
  creator_name: string;
  coin_price: number;
  creator_status: 'active' | 'inactive';
  thumbnail_key: string | null;
  unlock_count: number;
}

interface UserRow extends RowDataPacket {
  id: number;
  name: string;
  balance: number;
  created_at: Date;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly settings: AppSettingsService,
    private readonly storage: R2StorageService,
    private readonly wallet: WalletService,
  ) {}

  async login(dto: AdminLoginDto) {
    const [rows] = await this.db.query<AdminRow[]>(
      'SELECT id, email, password_hash, name FROM admins WHERE email = ? LIMIT 1',
      [dto.email],
    );
    const admin = rows[0];
    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, admin.password_hash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.jwt.sign(
      { sub: admin.id, email: admin.email, type: 'admin' },
      {
        secret: this.config.get<string>('ADMIN_JWT_SECRET') ?? 'dev-admin-jwt-secret',
        expiresIn: this.config.get('ADMIN_JWT_EXPIRES_IN') ?? '7d',
      },
    );

    return {
      token,
      admin: { id: admin.id, email: admin.email, name: admin.name },
    };
  }

  async getDashboard() {
    const [userCount] = await this.db.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM users',
    );
    const [creatorCount] = await this.db.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM girls WHERE status = 'active'",
    );
    const [unlockCount] = await this.db.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM video_unlocks',
    );
    const [rechargeStats] = await this.db.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total, COALESCE(SUM(amount_inr), 0) AS revenue FROM recharge_history WHERE status = 'success'",
    );

    return {
      totalUsers: Number(userCount[0]?.total ?? 0),
      activeCreators: Number(creatorCount[0]?.total ?? 0),
      totalUnlocks: Number(unlockCount[0]?.total ?? 0),
      successfulRecharges: Number(rechargeStats[0]?.total ?? 0),
      totalRevenueInr: Number(rechargeStats[0]?.revenue ?? 0),
    };
  }

  async listCreators(page: number, limit: number) {
    const offset = paginationOffset(page, limit);

    const [countRows] = await this.db.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM girls',
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await this.db.query<CreatorRow[]>(
      `SELECT g.id, g.name, g.coin_price, g.status, g.thumbnail_key, g.photo_key, g.created_at,
              CASE WHEN v.id IS NULL THEN 0 ELSE 1 END AS has_video
       FROM girls g
       LEFT JOIN videos v ON v.girl_id = g.id
       ORDER BY g.id DESC
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );

    const data = rows.map((row) => ({
      id: row.id,
      name: row.name,
      coinPrice: row.coin_price,
      isActive: row.status === 'active',
      hasVideo: (row as CreatorRow & { has_video: number }).has_video === 1,
      hasPhoto: !!row.photo_key,
      createdAt: row.created_at.toISOString(),
    }));

    return paginate(data, page, limit, total);
  }

  async listVideos(page: number, limit: number) {
    const offset = paginationOffset(page, limit);

    const [countRows] = await this.db.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM videos',
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await this.db.query<AdminVideoRow[]>(
      `SELECT v.id, v.girl_id, v.storage_key, v.duration_seconds,
              v.created_at, v.updated_at,
              g.name AS creator_name, g.coin_price, g.status AS creator_status,
              g.thumbnail_key,
              (SELECT COUNT(*) FROM video_unlocks vu WHERE vu.girl_id = v.girl_id) AS unlock_count
       FROM videos v
       JOIN girls g ON g.id = v.girl_id
       ORDER BY v.updated_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );

    const ttl = this.settings.getSignedUrlTtl();
    const data = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        creatorId: row.girl_id,
        creatorName: row.creator_name,
        coinPrice: row.coin_price,
        creatorActive: row.creator_status === 'active',
        storageKey: row.storage_key,
        r2Path: row.storage_key,
        durationSeconds: row.duration_seconds,
        unlockCount: Number(row.unlock_count ?? 0),
        thumbnailUrl: row.thumbnail_key
          ? await this.storage.getSignedUrl(row.thumbnail_key, ttl)
          : null,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      })),
    );

    return paginate(data, page, limit, total);
  }

  async createCreator(dto: CreateCreatorDto) {
    const [result] = await this.db.query<ResultSetHeader>(
      'INSERT INTO girls (name, coin_price, status) VALUES (?, ?, ?)',
      [dto.name, dto.coinPrice, 'active'],
    );

    await this.settings.bumpGirlsVersion();

    return {
      id: result.insertId,
      name: dto.name,
      coinPrice: dto.coinPrice,
    };
  }

  async updateCreator(id: number, dto: UpdateCreatorDto) {
    const [existing] = await this.db.query<CreatorRow[]>(
      'SELECT id FROM girls WHERE id = ? LIMIT 1',
      [id],
    );
    if (!existing[0]) {
      throw new NotFoundException('Creator not found');
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (dto.name !== undefined) {
      updates.push('name = ?');
      params.push(dto.name);
    }
    if (dto.coinPrice !== undefined) {
      updates.push('coin_price = ?');
      params.push(dto.coinPrice);
    }
    if (dto.isActive !== undefined) {
      updates.push('status = ?');
      params.push(dto.isActive ? 'active' : 'inactive');
    }

    if (updates.length === 0) {
      throw new BadRequestException('No fields to update');
    }

    params.push(id);
    await this.db.query(
      `UPDATE girls SET ${updates.join(', ')} WHERE id = ?`,
      params,
    );

    await this.settings.bumpGirlsVersion();
    return { success: true };
  }

  async deleteCreator(id: number) {
    const [result] = await this.db.query<ResultSetHeader>(
      'DELETE FROM girls WHERE id = ?',
      [id],
    );
    if (result.affectedRows === 0) {
      throw new NotFoundException('Creator not found');
    }
    await this.settings.bumpGirlsVersion();
    return { success: true };
  }

  async uploadPhoto(id: number, file: Express.Multer.File) {
    const validFile = assertUploadFile(file, PHOTO_UPLOAD_RULES);
    await this.ensureCreator(id);
    const ext = extensionForMime(validFile.mimetype, 'jpg');
    const key = `creators/${id}/photo-${Date.now()}.${ext}`;
    await this.storage.uploadObject(key, validFile.buffer, validFile.mimetype);
    await this.db.query('UPDATE girls SET photo_key = ? WHERE id = ?', [key, id]);
    return this.buildUploadResponse(key, 'photo', id);
  }

  async uploadVideo(id: number, file: Express.Multer.File) {
    const validFile = assertUploadFile(file, VIDEO_UPLOAD_RULES);
    await this.ensureCreator(id);
    const ext = extensionForMime(validFile.mimetype, 'mp4');
    const key = `creators/${id}/video-${Date.now()}.${ext}`;
    await this.storage.uploadObject(key, validFile.buffer, validFile.mimetype);

    await this.db.query(
      `INSERT INTO videos (girl_id, storage_key, duration_seconds)
       VALUES (?, ?, 0)
       ON DUPLICATE KEY UPDATE storage_key = VALUES(storage_key), updated_at = CURRENT_TIMESTAMP`,
      [id, key],
    );

    await this.settings.bumpGirlsVersion();
    return this.buildUploadResponse(key, 'video', id);
  }

  async uploadThumbnail(id: number, file: Express.Multer.File) {
    const validFile = assertUploadFile(file, THUMBNAIL_UPLOAD_RULES);
    await this.ensureCreator(id);
    const ext = extensionForMime(validFile.mimetype, 'jpg');
    const key = `creators/${id}/thumbnail-${Date.now()}.${ext}`;
    await this.storage.uploadObject(key, validFile.buffer, validFile.mimetype);
    await this.db.query('UPDATE girls SET thumbnail_key = ? WHERE id = ?', [
      key,
      id,
    ]);
    await this.settings.bumpGirlsVersion();
    return this.buildUploadResponse(key, 'thumbnail', id);
  }

  getStorageStatus() {
    return {
      provider: 'cloudflare-r2',
      configured: this.storage.isConfigured(),
      bucket: this.storage.getBucketName(),
    };
  }

  private buildUploadResponse(key: string, type: string, creatorId: number) {
    return {
      success: true,
      type,
      creatorId,
      key,
      path: key,
      storage: 'r2',
    };
  }

  async listUsers(page: number, limit: number) {
    const offset = paginationOffset(page, limit);

    const [countRows] = await this.db.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM users',
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await this.db.query<UserRow[]>(
      `SELECT u.id, u.name, COALESCE(w.balance, 0) AS balance, u.created_at
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       ORDER BY u.id DESC
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );

    const data = rows.map((row) => ({
      id: row.id,
      name: row.name,
      balance: row.balance,
      createdAt: row.created_at.toISOString(),
    }));

    return paginate(data, page, limit, total);
  }

  async creditUserWallet(
    userId: number,
    amount: number,
    description?: string,
  ) {
    const [rows] = await this.db.query<UserRow[]>(
      `SELECT u.id, u.name, COALESCE(w.balance, 0) AS balance, u.created_at
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.id = ?
       LIMIT 1`,
      [userId],
    );
    if (!rows[0]) {
      throw new NotFoundException('User not found');
    }

    const balance = await this.wallet.creditCoins(
      userId,
      amount,
      description ?? `Admin credit: ${amount} coins`,
    );

    return {
      userId,
      credited: amount,
      balance,
    };
  }

  async creditAllWallets(amount: number, description?: string) {
    const [rows] = await this.db.query<RowDataPacket[]>(
      'SELECT user_id FROM wallets ORDER BY user_id ASC',
    );

    const label = description ?? `Bulk test credit: ${amount} coins`;
    const results: Array<{ userId: number; balance: number }> = [];

    for (const row of rows) {
      const userId = Number(row.user_id);
      const balance = await this.wallet.creditCoins(userId, amount, label);
      results.push({ userId, balance });
    }

    return {
      credited: amount,
      users: results.length,
      results,
    };
  }

  async deleteUser(id: number) {
    const [result] = await this.db.query<ResultSetHeader>(
      'DELETE FROM users WHERE id = ?',
      [id],
    );
    if (result.affectedRows === 0) {
      throw new NotFoundException('User not found');
    }
    return { success: true };
  }

  async listWalletTransactions(page: number, limit: number) {
    const offset = paginationOffset(page, limit);

    const [countRows] = await this.db.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM wallet_transactions',
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await this.db.query<RowDataPacket[]>(
      `SELECT id, user_id, type, amount, description, created_at
       FROM wallet_transactions
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );

    return paginate(rows, page, limit, total);
  }

  async listRecharges(page: number, limit: number) {
    const offset = paginationOffset(page, limit);

    const [countRows] = await this.db.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM recharge_history',
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await this.db.query<RowDataPacket[]>(
      `SELECT id, user_id, amount_inr, coins_added, status, created_at
       FROM recharge_history
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );

    return paginate(rows, page, limit, total);
  }

  async listPurchases(page: number, limit: number) {
    const offset = paginationOffset(page, limit);

    const [countRows] = await this.db.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM video_unlocks',
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await this.db.query<RowDataPacket[]>(
      `SELECT vu.id, vu.girl_id, g.name AS girl_name, vu.coins_spent, vu.created_at
       FROM video_unlocks vu
       JOIN girls g ON g.id = vu.girl_id
       ORDER BY vu.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );

    return paginate(rows, page, limit, total);
  }

  private async ensureCreator(id: number) {
    const [rows] = await this.db.query<CreatorRow[]>(
      'SELECT id FROM girls WHERE id = ? LIMIT 1',
      [id],
    );
    if (!rows[0]) {
      throw new NotFoundException('Creator not found');
    }
  }
}
