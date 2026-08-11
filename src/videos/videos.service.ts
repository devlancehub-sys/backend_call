import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { AppSettingsService } from '../app-config/app-settings.service';
import { DatabaseService } from '../database/database.service';
import { R2StorageService } from '../storage/r2-storage.service';
import { WalletService } from '../wallet/wallet.service';

interface GirlRow extends RowDataPacket {
  id: number;
  name: string;
  coin_price: number;
  status: string;
}

interface UnlockRow extends RowDataPacket {
  id: number;
}

interface VideoRow extends RowDataPacket {
  storage_key: string;
  duration_seconds: number;
}

@Injectable()
export class VideosService {
  constructor(
    private readonly db: DatabaseService,
    private readonly wallet: WalletService,
    private readonly storage: R2StorageService,
    private readonly settings: AppSettingsService,
  ) {}

  async unlockVideo(userId: number, girlId: number) {
    const [girls] = await this.db.query<GirlRow[]>(
      'SELECT id, name, coin_price, status FROM girls WHERE id = ? LIMIT 1',
      [girlId],
    );
    const girl = girls[0];
    if (!girl) {
      throw new NotFoundException('Creator not found');
    }
    if (girl.status !== 'active') {
      throw new BadRequestException('Creator is not available');
    }

    const [videos] = await this.db.query<VideoRow[]>(
      'SELECT storage_key, duration_seconds FROM videos WHERE girl_id = ? LIMIT 1',
      [girlId],
    );
    if (!videos[0]) {
      throw new BadRequestException('Premium video not available yet');
    }

    const [existing] = await this.db.query<UnlockRow[]>(
      'SELECT id FROM video_unlocks WHERE user_id = ? AND girl_id = ? LIMIT 1',
      [userId, girlId],
    );
    if (existing[0]) {
      const balance = await this.wallet.fetchBalance(userId);
      return {
        alreadyUnlocked: true,
        balance,
        coinsSpent: 0,
        girlId,
      };
    }

    const connection = await this.db.getPool().getConnection();
    let unlockId = 0;
    let balance = 0;

    try {
      await connection.beginTransaction();

      const [walletRows] = await connection.query<RowDataPacket[]>(
        'SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE',
        [userId],
      );
      balance = Number(walletRows[0]?.balance ?? 0);

      if (balance < girl.coin_price) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      const [insertResult] = await connection.query<ResultSetHeader>(
        'INSERT INTO video_unlocks (user_id, girl_id, coins_spent) VALUES (?, ?, ?)',
        [userId, girlId, girl.coin_price],
      );
      unlockId = insertResult.insertId;

      await connection.query(
        'UPDATE wallets SET balance = balance - ? WHERE user_id = ?',
        [girl.coin_price, userId],
      );

      await connection.query(
        `INSERT INTO wallet_transactions (user_id, type, amount, description)
         VALUES (?, 'debit', ?, ?)`,
        [userId, girl.coin_price, `Unlock video: ${girl.name}`],
      );

      await connection.commit();
      balance -= girl.coin_price;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return {
      unlockId,
      girlId,
      coinsSpent: girl.coin_price,
      balance,
    };
  }

  async getAccess(userId: number, girlId: number) {
    const [unlocks] = await this.db.query<UnlockRow[]>(
      'SELECT id FROM video_unlocks WHERE user_id = ? AND girl_id = ? LIMIT 1',
      [userId, girlId],
    );
    if (!unlocks[0]) {
      throw new BadRequestException('Video not unlocked');
    }

    const [videos] = await this.db.query<VideoRow[]>(
      'SELECT storage_key, duration_seconds FROM videos WHERE girl_id = ? LIMIT 1',
      [girlId],
    );
    const video = videos[0];
    if (!video) {
      throw new NotFoundException('Video not found');
    }

    const expiresIn = this.settings.getSignedUrlTtl();
    const streamUrl = await this.storage.getSignedUrl(
      video.storage_key,
      expiresIn,
    );

    return {
      streamUrl,
      expiresIn,
      durationSeconds: video.duration_seconds,
    };
  }
}
