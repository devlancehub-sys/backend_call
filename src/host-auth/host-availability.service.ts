import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SocketGateway } from '../socket/socket.gateway';
import { RECORD_STATUS } from '../common/constants/record-status';

export type HostStatus = 'offline' | 'available' | 'busy';

@Injectable()
export class HostAvailabilityService {
  private readonly logger = new Logger(HostAvailabilityService.name);

  constructor(
    private db: DatabaseService,
    private socket: SocketGateway,
  ) {}

  async getStatus(userId: number) {
    const row = await this.getHostRow(userId);
    return {
      success: true,
      data: this.mapStatus(row),
    };
  }

  async setStatus(userId: number, status: HostStatus) {
    if (!['offline', 'available', 'busy'].includes(status)) {
      throw new BadRequestException('Invalid status. Use offline, available, or busy');
    }

    const row = await this.getHostRow(userId);

    const availableSince =
      status === 'available' ? new Date() : status === 'offline' ? null : row.available_since;

    await this.db.query(
      `UPDATE female_hosts
       SET host_status = ?, available_since = ?,
           consecutive_missed_calls = CASE WHEN ? = 'available' THEN 0 ELSE consecutive_missed_calls END
       WHERE user_id = ?`,
      [status, availableSince, status, userId],
    );

    await this.db.query('UPDATE users SET is_online = ? WHERE id = ?', [
      status === 'available' ? 1 : 0,
      userId,
    ]);

    if (status === 'available') {
      this.socket.notifyRole('male', 'host_online', { host_id: userId });
    } else {
      this.socket.notifyRole('male', 'host_offline', { host_id: userId });
    }

    if (status === 'busy') {
      this.socket.notifyRole('male', 'host_busy', { host_id: userId });
    } else if (status === 'available') {
      this.socket.notifyRole('male', 'host_available', { host_id: userId });
    }

    const updated = await this.getHostRow(userId);
    return {
      success: true,
      message: `Status updated to ${status}`,
      data: this.mapStatus(updated),
    };
  }

  async assertCanReceiveCalls(hostId: number) {
    const row = await this.getHostRow(hostId);
    if (row.host_status !== 'available') {
      throw new BadRequestException(
        row.host_status === 'busy'
          ? 'Host is busy'
          : 'Host is not available for calls',
      );
    }
    return row;
  }

  async onCallAccepted(hostId: number) {
    await this.db.query(
      `UPDATE female_hosts SET host_status = 'busy', consecutive_missed_calls = 0 WHERE user_id = ?`,
      [hostId],
    );
    this.socket.notifyRole('male', 'host_busy', { host_id: hostId });
  }

  async onCallEnded(hostId: number) {
    const row = await this.getHostRow(hostId);
    if (row.host_status === 'offline') return;

    await this.db.query(
      `UPDATE female_hosts SET host_status = 'available' WHERE user_id = ? AND host_status = 'busy'`,
      [hostId],
    );
    this.socket.notifyRole('male', 'host_available', { host_id: hostId });
  }

  async recordMissedIncomingCall(hostId: number) {
    await this.db.query(
      `UPDATE female_hosts SET consecutive_missed_calls = consecutive_missed_calls + 1 WHERE user_id = ?`,
      [hostId],
    );

    const row = await this.getHostRow(hostId);
    const missed = Number(row.consecutive_missed_calls ?? 0);

    if (missed >= 3) {
      await this.db.query(
        `UPDATE female_hosts SET host_status = 'busy' WHERE user_id = ?`,
        [hostId],
      );
      this.socket.notifyRole('male', 'host_busy', { host_id: hostId });
      this.socket.notifyUser(hostId, 'host_auto_busy', {
        reason: '3_consecutive_missed_calls',
        missed_count: missed,
      });
      this.logger.warn(`Host ${hostId} auto-switched to busy after ${missed} missed calls`);
    }

    return missed;
  }

  async resetMissedOnAnswer(hostId: number) {
    await this.db.query(
      `UPDATE female_hosts SET consecutive_missed_calls = 0 WHERE user_id = ?`,
      [hostId],
    );
  }

  private async getHostRow(userId: number) {
    const rows = await this.db.query<any[]>(
      `SELECT fh.*, u.name, u.is_online
       FROM female_hosts fh
       JOIN users u ON u.id = fh.user_id
       WHERE fh.user_id = ? AND u.role = 'female' AND u.status = ?`,
      [userId, RECORD_STATUS.ACTIVE],
    );
    if (!rows.length) {
      throw new ForbiddenException('Female host profile not found');
    }
    return rows[0];
  }

  private mapStatus(row: any) {
    const availableSince = row.available_since ? new Date(row.available_since) : null;
    let onlineDurationSeconds = 0;
    if (row.host_status === 'available' && availableSince) {
      onlineDurationSeconds = Math.max(
        0,
        Math.floor((Date.now() - availableSince.getTime()) / 1000),
      );
    }

    return {
      host_status: row.host_status as HostStatus,
      consecutive_missed_calls: Number(row.consecutive_missed_calls ?? 0),
      available_since: availableSince?.toISOString() ?? null,
      online_duration_seconds: onlineDurationSeconds,
      is_online: !!row.is_online,
    };
  }
}
