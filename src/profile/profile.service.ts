import { Injectable, NotFoundException } from '@nestjs/common';
import { RowDataPacket } from 'mysql2';
import { DatabaseService } from '../database/database.service';

interface ProfileRow extends RowDataPacket {
  id: number;
  name: string;
  balance: number;
}

@Injectable()
export class ProfileService {
  constructor(private readonly db: DatabaseService) {}

  async getProfile(userId: number) {
    const [rows] = await this.db.query<ProfileRow[]>(
      `SELECT u.id, u.name, COALESCE(w.balance, 0) AS balance
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.id = ?
       LIMIT 1`,
      [userId],
    );

    const profile = rows[0];
    if (!profile) {
      throw new NotFoundException('User not found');
    }

    return {
      id: profile.id,
      name: profile.name,
      walletBalance: profile.balance,
    };
  }

  async updateProfile(userId: number, name: string) {
    await this.db.query('UPDATE users SET name = ? WHERE id = ?', [
      name,
      userId,
    ]);
    return this.getProfile(userId);
  }
}
