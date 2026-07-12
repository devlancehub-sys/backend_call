import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PushNotificationService } from '../common/services/push-notification.service';
import { RECORD_STATUS } from '../common/constants/record-status';

@Injectable()
export class FollowsService {
  constructor(
    private db: DatabaseService,
    private push: PushNotificationService,
  ) {}

  async follow(followerId: number, followingId: number) {
    if (followerId === followingId) {
      throw new BadRequestException('Cannot follow yourself');
    }

    const [users] = await this.db.query<any[]>(
      `SELECT id, role FROM users WHERE id IN (?, ?) AND status = ?`,
      [followerId, followingId, RECORD_STATUS.ACTIVE],
    );

    const follower = users.find((u) => u.id === followerId);
    const following = users.find((u) => u.id === followingId);

    if (!follower || !following) {
      throw new NotFoundException('User not found');
    }

    if (follower.role !== 'male') {
      throw new BadRequestException('Only male users can follow');
    }

    if (following.role !== 'female') {
      throw new BadRequestException('Can only follow female hosts');
    }

    const existing = await this.db.query<any[]>(
      `SELECT * FROM follows WHERE follower_id = ? AND following_id = ?`,
      [followerId, followingId],
    );

    if (existing.length) {
      await this.db.query(
        `UPDATE follows SET status = ? WHERE follower_id = ? AND following_id = ?`,
        [RECORD_STATUS.ACTIVE, followerId, followingId],
      );
      return { success: true, message: 'Follow updated' };
    }

    await this.db.query(
      `INSERT INTO follows (follower_id, following_id, status) VALUES (?, ?, ?)`,
      [followerId, followingId, RECORD_STATUS.ACTIVE],
    );

    return { success: true, message: 'Followed successfully' };
  }

  async unfollow(followerId: number, followingId: number) {
    const result = await this.db.query(
      `UPDATE follows SET status = ? WHERE follower_id = ? AND following_id = ?`,
      [RECORD_STATUS.INACTIVE, followerId, followingId],
    );

    if (!(result as any).affectedRows) {
      throw new NotFoundException('Follow not found');
    }

    return { success: true, message: 'Unfollowed successfully' };
  }

  async getFollowers(hostId: number) {
    const followers = await this.db.query<any[]>(
      `SELECT u.id, u.name, u.avatar_url, u.role
       FROM follows f
       JOIN users u ON u.id = f.follower_id AND u.status = ?
       WHERE f.following_id = ? AND f.status = ?`,
      [RECORD_STATUS.ACTIVE, hostId, RECORD_STATUS.ACTIVE],
    );

    return { success: true, data: followers };
  }

  async getFollowing(userId: number) {
    const following = await this.db.query<any[]>(
      `SELECT u.id, u.name, u.avatar_url, u.role, u.is_online
       FROM follows f
       JOIN users u ON u.id = f.following_id AND u.status = ?
       WHERE f.follower_id = ? AND f.status = ?`,
      [RECORD_STATUS.ACTIVE, userId, RECORD_STATUS.ACTIVE],
    );

    return { success: true, data: following };
  }

  async getFollowerIds(hostId: number): Promise<number[]> {
    const rows = await this.db.query<{ follower_id: number }[]>(
      `SELECT follower_id FROM follows WHERE following_id = ? AND status = ?`,
      [hostId, RECORD_STATUS.ACTIVE],
    );
    return rows.map((r) => Number(r.follower_id));
  }

  async notifyFollowersHostOnline(hostId: number, hostName: string) {
    const followerIds = await this.getFollowerIds(hostId);
    if (!followerIds.length) return;

    const data: Record<string, string> = {
      type: 'host_online',
      host_id: String(hostId),
      host_name: hostName,
    };

    for (const followerId of followerIds) {
      await this.push.sendToUser(
        followerId,
        `${hostName} is online`,
        'Tap to call now',
        data,
      );
    }
  }
}
