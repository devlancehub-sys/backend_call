import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { SocketGateway } from '../socket/socket.gateway';
import { calculateBilling } from '../common/utils/billing.util';
import {
  getHostLevel,
  resolveEffectiveRate,
} from '../common/utils/rate-tier.util';
import { ZegoTokenService } from '../zego/zego-token.service';
import { PlatformSettingsService } from '../common/services/platform-settings.service';

@Injectable()
export class CallsService {
  constructor(
    private db: DatabaseService,
    private config: ConfigService,
    private socket: SocketGateway,
    private zegoToken: ZegoTokenService,
    private platformSettings: PlatformSettingsService,
  ) {}

  /** Boy calls girl — money always deducted from boy (caller_id) */
  async initiate(callerId: number, hostId: number) {
    const hosts = await this.db.query<any[]>(
      `SELECT u.id, u.name, u.is_online, fh.total_calls
       FROM users u
       JOIN female_hosts fh ON fh.user_id = u.id
       WHERE u.id = ? AND u.role = 'female'`,
      [hostId],
    );

    if (!hosts.length) throw new NotFoundException('Host not found');
    if (!hosts[0].is_online) throw new BadRequestException('Host is offline');

    const totalCalls = parseInt(String(hosts[0].total_calls ?? 0), 10);
    const hostLevel = getHostLevel(totalCalls);
    const ratePerMinute = resolveEffectiveRate(totalCalls);

    await this.ensureCallerBalance(callerId, ratePerMinute);

    const roomId = this.createRoomId();
    const result = await this.db.query<any>(
      `INSERT INTO calls (caller_id, host_id, initiated_by, agora_channel, rate_per_minute, status)
       VALUES (?, ?, 'male', ?, ?, 'ringing')`,
      [callerId, hostId, roomId, ratePerMinute],
    );

    const callId = result.insertId;
    const payload = this.buildCallPayload({
      callId,
      callerId,
      hostId,
      roomId,
      ratePerMinute,
      hostLevel,
      initiatedBy: 'male',
    });

    this.socket.notifyUser(hostId, 'incoming_call', payload);

    return { success: true, data: payload };
  }

  /** Girl calls boy — still deducts from boy's wallet only */
  async initiateFromHost(hostId: number, callerId: number) {
    const hosts = await this.db.query<any[]>(
      `SELECT u.id, u.name, fh.total_calls FROM users u
       JOIN female_hosts fh ON fh.user_id = u.id
       WHERE u.id = ? AND u.role = 'female'`,
      [hostId],
    );
    if (!hosts.length) throw new NotFoundException('Host profile not found');

    const callers = await this.db.query<any[]>(
      `SELECT u.id, u.name, u.is_online FROM users u
       WHERE u.id = ? AND u.role = 'male' AND u.is_active = 1`,
      [callerId],
    );
    if (!callers.length) throw new NotFoundException('User not found');
    if (!callers[0].is_online) throw new BadRequestException('User is offline');

    const totalCalls = parseInt(String(hosts[0].total_calls ?? 0), 10);
    const hostLevel = getHostLevel(totalCalls);
    const ratePerMinute = resolveEffectiveRate(totalCalls);

    await this.ensureCallerBalance(callerId, ratePerMinute);

    const roomId = this.createRoomId();
    const result = await this.db.query<any>(
      `INSERT INTO calls (caller_id, host_id, initiated_by, agora_channel, rate_per_minute, status)
       VALUES (?, ?, 'female', ?, ?, 'ringing')`,
      [callerId, hostId, roomId, ratePerMinute],
    );

    const callId = result.insertId;
    const payload = this.buildCallPayload({
      callId,
      callerId,
      hostId,
      roomId,
      ratePerMinute,
      hostLevel,
      initiatedBy: 'female',
      hostName: hosts[0].name,
      callerName: callers[0].name,
    });

    this.socket.notifyUser(callerId, 'incoming_call', payload);

    return { success: true, data: payload };
  }

  async accept(callId: number, userId: number, role: string) {
    const calls = await this.db.query<any[]>(
      `SELECT * FROM calls WHERE id = ? AND status = 'ringing'`,
      [callId],
    );
    if (!calls.length) throw new NotFoundException('Call not found');

    const call = calls[0];
    const initiatedBy = call.initiated_by || 'male';

    if (initiatedBy === 'male' && (role !== 'female' || call.host_id !== userId)) {
      throw new ForbiddenException('Only the host can accept this call');
    }
    if (initiatedBy === 'female' && (role !== 'male' || call.caller_id !== userId)) {
      throw new ForbiddenException('Only the user can accept this call');
    }

    await this.db.query(`UPDATE calls SET status = 'active', started_at = NOW() WHERE id = ?`, [
      callId,
    ]);

    const roomId = call.agora_channel;
    const notifyId = initiatedBy === 'male' ? call.caller_id : call.host_id;
    const accepterToken = this.safeGenerateToken(userId, roomId);
    const peerToken = this.safeGenerateToken(notifyId, roomId);

    this.socket.notifyUser(notifyId, 'call_accepted', {
      call_id: callId,
      room_id: roomId,
      agora_channel: roomId,
      rate_per_minute: call.rate_per_minute,
      zego_token: peerToken,
      ...this.zegoToken.publicAppConfig(),
    });

    return {
      success: true,
      data: {
        call_id: callId,
        room_id: roomId,
        agora_channel: roomId,
        rate_per_minute: call.rate_per_minute,
        zego_token: accepterToken,
        ...this.zegoToken.publicAppConfig(),
      },
    };
  }

  async reject(callId: number, userId: number, role: string) {
    const calls = await this.db.query<any[]>(
      `SELECT * FROM calls WHERE id = ? AND status = 'ringing'`,
      [callId],
    );
    if (!calls.length) throw new NotFoundException('Call not found');

    const call = calls[0];
    const initiatedBy = call.initiated_by || 'male';

    if (initiatedBy === 'male' && (role !== 'female' || call.host_id !== userId)) {
      throw new ForbiddenException('Only the host can reject this call');
    }
    if (initiatedBy === 'female' && (role !== 'male' || call.caller_id !== userId)) {
      throw new ForbiddenException('Only the user can reject this call');
    }

    await this.db.query(`UPDATE calls SET status = 'rejected', ended_at = NOW() WHERE id = ?`, [
      callId,
    ]);

    const notifyId = initiatedBy === 'male' ? call.caller_id : call.host_id;
    this.socket.notifyUser(notifyId, 'call_rejected', { call_id: callId });

    return { success: true, message: 'Call rejected' };
  }

  /** End call — always deduct from caller_id (male), host (female) earns */
  async end(callId: number, userId: number) {
    const calls = await this.db.query<any[]>(
      `SELECT * FROM calls WHERE id = ? AND status = 'active'`,
      [callId],
    );
    if (!calls.length) throw new NotFoundException('Active call not found');

    const call = calls[0];
    if (call.caller_id !== userId && call.host_id !== userId) {
      throw new ForbiddenException('You are not a participant in this call');
    }

    const durationSeconds = Math.floor(
      (Date.now() - new Date(call.started_at).getTime()) / 1000,
    );
    const commissionPct = this.platformSettings.getCommissionPercentage();
    const billing = calculateBilling(
      durationSeconds,
      parseFloat(call.rate_per_minute),
      commissionPct,
    );

    const pool = this.db.getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [wallets] = await conn.query<any[]>(
        'SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE',
        [call.caller_id],
      );
      const newBalance = Math.max(0, parseFloat(wallets[0].balance) - billing.totalAmount);
      await conn.query('UPDATE wallets SET balance = ? WHERE user_id = ?', [
        newBalance,
        call.caller_id,
      ]);

      await conn.query(
        `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, status, description)
         VALUES (?, 'call_deduction', ?, ?, 'completed', ?)`,
        [call.caller_id, -billing.totalAmount, newBalance, `Call #${call.id}`],
      );

      await conn.query(
        `UPDATE calls SET status = 'ended', ended_at = NOW(), duration_seconds = ?,
         amount_deducted = ?, host_earning = ?, platform_commission = ? WHERE id = ?`,
        [
          durationSeconds,
          billing.totalAmount,
          billing.hostEarning,
          billing.platformCommission,
          call.id,
        ],
      );

      await conn.query(
        `INSERT INTO call_logs (call_id, caller_id, host_id, duration_seconds, amount_deducted, host_earning)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          call.id,
          call.caller_id,
          call.host_id,
          durationSeconds,
          billing.totalAmount,
          billing.hostEarning,
        ],
      );

      await conn.query(
        `INSERT INTO earnings (host_id, call_id, amount, type, description) VALUES (?, ?, ?, 'call', ?)`,
        [call.host_id, call.id, billing.hostEarning, `Call #${call.id}`],
      );

      await conn.query(
        `UPDATE female_hosts SET total_calls = total_calls + 1,
         total_duration_seconds = total_duration_seconds + ? WHERE user_id = ?`,
        [durationSeconds, call.host_id],
      );

      await conn.commit();

      const endPayload = {
        call_id: call.id,
        duration_seconds: durationSeconds,
        billable_minutes: billing.billableMinutes,
        rate_per_minute: parseFloat(call.rate_per_minute),
        amount_deducted: billing.totalAmount,
        host_earning: billing.hostEarning,
        platform_commission: billing.platformCommission,
        paid_by: 'caller' as const,
      };

      this.socket.notifyUser(call.caller_id, 'wallet_updated', {
        user_id: call.caller_id,
        balance: newBalance,
      });
      this.socket.notifyUser(call.host_id, 'earning_updated', {
        host_id: call.host_id,
        amount: billing.hostEarning,
      });
      this.socket.notifyUser(call.caller_id, 'call_ended', endPayload);
      this.socket.notifyUser(call.host_id, 'call_ended', endPayload);

      return {
        success: true,
        data: endPayload,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async generateCallToken(callId: number, userId: number) {
    const calls = await this.db.query<any[]>(
      `SELECT * FROM calls WHERE id = ? AND status IN ('ringing', 'active')`,
      [callId],
    );
    if (!calls.length) throw new NotFoundException('Call not found');

    const call = calls[0];
    if (call.caller_id !== userId && call.host_id !== userId) {
      throw new ForbiddenException('You are not a participant in this call');
    }

    const roomId = call.agora_channel;
    const token = this.safeGenerateToken(userId, roomId);

    return {
      success: true,
      data: {
        call_id: callId,
        room_id: roomId,
        agora_channel: roomId,
        zego_token: token,
        ...this.zegoToken.publicAppConfig(),
      },
    };
  }

  async getHistory(userId: number, role: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const isHost = role === 'female';
    const column = isHost ? 'host_id' : 'caller_id';
    const joinColumn = isHost ? 'caller_id' : 'host_id';

    const logs = await this.db.query(
      `SELECT cl.*, u.name as partner_name, u.avatar_url as partner_avatar
       FROM call_logs cl
       JOIN users u ON u.id = cl.${joinColumn}
       WHERE cl.${column} = ?
       ORDER BY cl.created_at DESC LIMIT ? OFFSET ?`,
      [userId, limit, offset],
    );
    return { success: true, data: logs };
  }

  private createRoomId(): string {
    return `call_${uuidv4()}`;
  }

  private buildCallPayload(params: {
    callId: number;
    callerId: number;
    hostId: number;
    roomId: string;
    ratePerMinute: number;
    hostLevel: number;
    initiatedBy: 'male' | 'female';
    hostName?: string;
    callerName?: string;
  }) {
    const base = {
      call_id: params.callId,
      caller_id: params.callerId,
      host_id: params.hostId,
      room_id: params.roomId,
      agora_channel: params.roomId,
      rate_per_minute: params.ratePerMinute,
      host_level: params.hostLevel,
      initiated_by: params.initiatedBy,
      ...this.zegoToken.publicAppConfig(),
    };

    if (params.hostName) {
      return { ...base, host_name: params.hostName };
    }
    if (params.callerName) {
      return { ...base, caller_name: params.callerName };
    }
    return base;
  }

  private safeGenerateToken(userId: number, roomId: string): string | null {
    if (!this.zegoToken.isConfigured()) return null;
    return this.zegoToken.generateRoomToken(userId, roomId);
  }

  private async ensureCallerBalance(callerId: number, ratePerMinute: number) {
    const wallets = await this.db.query<any[]>(
      'SELECT balance FROM wallets WHERE user_id = ?',
      [callerId],
    );
    if (parseFloat(wallets[0]?.balance || 0) < ratePerMinute) {
      throw new BadRequestException('Insufficient balance');
    }
  }
}
