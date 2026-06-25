import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { SocketGateway } from '../socket/socket.gateway';
import { OnlineUserManagerService } from '../socket/online-user-manager.service';
import { calculateBilling } from '../common/utils/billing.util';
import {
  getHostLevel,
  resolveEffectiveRate,
} from '../common/utils/rate-tier.util';
import { ZegoTokenService } from '../zego/zego-token.service';
import { PlatformSettingsService } from '../common/services/platform-settings.service';
import { PushNotificationService } from '../common/services/push-notification.service';
import { HostAvailabilityService } from '../host-auth/host-availability.service';
import { HostDailyTaskService } from '../host-auth/host-daily-task.service';
import { RECORD_STATUS } from '../common/constants/record-status';

const RING_TIMEOUT_MS = 45_000;

@Injectable()
export class CallsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CallsService.name);
  private readonly ringTimeouts = new Map<number, NodeJS.Timeout>();
  private staleCallJanitor: NodeJS.Timeout | null = null;

  constructor(
    private db: DatabaseService,
    private config: ConfigService,
    private socket: SocketGateway,
    private presence: OnlineUserManagerService,
    private zegoToken: ZegoTokenService,
    private platformSettings: PlatformSettingsService,
    private push: PushNotificationService,
    private hostAvailability: HostAvailabilityService,
    private hostDailyTask: HostDailyTaskService,
  ) {}

  onModuleInit() {
    void this.releaseStuckBusyHosts();
    this.staleCallJanitor = setInterval(() => {
      this.cleanupStaleActiveCalls().catch((err) =>
        this.logger.warn(`stale call janitor failed: ${(err as Error)?.message}`),
      );
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.staleCallJanitor) {
      clearInterval(this.staleCallJanitor);
      this.staleCallJanitor = null;
    }
  }

  /** Boy calls girl — money always deducted from boy (caller_id) */
  async initiate(callerId: number, hostId: number) {
    this.ensureZegoConfigured();

    await this.hostAvailability.assertCanReceiveCalls(hostId);

    if (this.presence.isUserInCall(hostId)) {
      throw new BadRequestException('User is busy on another call');
    }

    if (this.presence.isUserInCall(callerId)) {
      throw new BadRequestException('You are already on a call');
    }

    const hosts = await this.db.query<any[]>(
      `SELECT u.id, u.name, u.avatar_url, u.is_online, fh.total_calls, fh.host_status
       FROM users u
       JOIN female_hosts fh ON fh.user_id = u.id AND fh.status = ?
       WHERE u.id = ? AND u.role = 'female' AND u.status = ?`,
      [RECORD_STATUS.ACTIVE, hostId, RECORD_STATUS.ACTIVE],
    );

    if (!hosts.length) throw new NotFoundException('Host not found');

    const callers = await this.db.query<any[]>(
      `SELECT id, name, avatar_url FROM users WHERE id = ? AND role = 'male' AND status = ?`,
      [callerId, RECORD_STATUS.ACTIVE],
    );

    const totalCalls = parseInt(String(hosts[0].total_calls ?? 0), 10);
    const hostLevel = getHostLevel(totalCalls);
    const ratePerMinute = resolveEffectiveRate(totalCalls);

    await this.ensureCallerBalance(callerId, ratePerMinute);

    const roomId = this.createRoomId();
    const result = await this.db.query<any>(
      `INSERT INTO calls (caller_id, host_id, initiated_by, room_id, rate_per_minute, status)
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
      hostName: hosts[0].name,
      hostAvatarUrl: hosts[0].avatar_url,
      callerName: callers[0]?.name,
      callerAvatarUrl: callers[0]?.avatar_url,
    });

    const socketDelivered = this.socket.notifyUser(hostId, 'incoming_call', payload);
    const pushSent = await this.push.sendIncomingCall(hostId, payload);

    if (!socketDelivered && !pushSent) {
      await this.db.query(`UPDATE calls SET status = 'missed', ended_at = NOW() WHERE id = ?`, [
        callId,
      ]);
      throw new BadRequestException('Host is not reachable');
    }

    this.scheduleMissedCallTimeout(callId, callerId, hostId, 'male');

    return { success: true, data: payload };
  }

  /** Girl calls boy — still deducts from boy's wallet only */
  async initiateFromHost(hostId: number, callerId: number) {
    this.ensureZegoConfigured();

    if (!this.socket.isUserOnline(callerId)) {
      throw new BadRequestException('User is offline');
    }

    if (this.presence.isUserInCall(callerId)) {
      throw new BadRequestException('User is busy on another call');
    }

    if (this.presence.isUserInCall(hostId)) {
      throw new BadRequestException('You are already on a call');
    }

    const hosts = await this.db.query<any[]>(
      `SELECT u.id, u.name, u.avatar_url, fh.total_calls FROM users u
       JOIN female_hosts fh ON fh.user_id = u.id AND fh.status = ?
       WHERE u.id = ? AND u.role = 'female' AND u.status = ?`,
      [RECORD_STATUS.ACTIVE, hostId, RECORD_STATUS.ACTIVE],
    );
    if (!hosts.length) throw new NotFoundException('Host profile not found');

    const callers = await this.db.query<any[]>(
      `SELECT u.id, u.name, u.avatar_url, u.is_online FROM users u
       WHERE u.id = ? AND u.role = 'male' AND u.status = ?`,
      [callerId, RECORD_STATUS.ACTIVE],
    );
    if (!callers.length) throw new NotFoundException('User not found');

    const totalCalls = parseInt(String(hosts[0].total_calls ?? 0), 10);
    const hostLevel = getHostLevel(totalCalls);
    const ratePerMinute = resolveEffectiveRate(totalCalls);

    await this.ensureCallerBalance(callerId, ratePerMinute);

    const roomId = this.createRoomId();
    const result = await this.db.query<any>(
      `INSERT INTO calls (caller_id, host_id, initiated_by, room_id, rate_per_minute, status)
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
      hostAvatarUrl: hosts[0].avatar_url,
      callerName: callers[0].name,
      callerAvatarUrl: callers[0].avatar_url,
    });

    const delivered = this.socket.notifyUser(callerId, 'incoming_call', payload);
    if (!delivered) {
      await this.db.query(`UPDATE calls SET status = 'missed', ended_at = NOW() WHERE id = ?`, [
        callId,
      ]);
      throw new BadRequestException('User is offline');
    }

    this.scheduleMissedCallTimeout(callId, callerId, hostId, 'female');

    return { success: true, data: payload };
  }

  async accept(callId: number, userId: number, role: string) {
    this.clearRingTimeout(callId);

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

    if (!this.zegoToken.isConfigured()) {
      this.logger.error(
        'ZEGOCLOUD not configured — set ZEGOCLOUD_APP_ID and ZEGOCLOUD_SERVER_SECRET (32 chars)',
      );
      throw new BadRequestException(
        'Voice calls are unavailable. ZEGOCLOUD is not configured on the server.',
      );
    }

    const roomId = call.room_id;
    const notifyId = initiatedBy === 'male' ? call.caller_id : call.host_id;

    const accepterToken = this.zegoToken.generateRoomToken(userId, roomId);
    const peerToken = this.zegoToken.generateRoomToken(notifyId, roomId);
    if (!accepterToken || !peerToken) {
      throw new BadRequestException('Voice call could not start. ZEGOCLOUD token error.');
    }

    await this.db.query(
      `UPDATE calls SET status = 'active', started_at = NOW() WHERE id = ? AND status = 'ringing'`,
      [callId],
    );
    const activeRows = await this.db.query<any[]>(
      `SELECT id FROM calls WHERE id = ? AND status = 'active'`,
      [callId],
    );
    if (!activeRows.length) {
      throw new NotFoundException('Call not found or already handled');
    }

    this.presence.markUsersInCall(call.caller_id, call.host_id);

    if (role === 'female') {
      await this.hostAvailability.resetMissedOnAnswer(call.host_id);
      await this.hostAvailability.onCallAccepted(call.host_id);
    }

    this.socket.notifyUser(notifyId, 'call_accepted', {
      call_id: callId,
      room_id: roomId,
      rate_per_minute: call.rate_per_minute,
      zego_token: peerToken,
      ...this.zegoToken.publicAppConfig(),
    });

    return {
      success: true,
      data: {
        call_id: callId,
        room_id: roomId,
        rate_per_minute: call.rate_per_minute,
        zego_token: accepterToken,
        ...this.zegoToken.publicAppConfig(),
      },
    };
  }

  async reject(callId: number, userId: number, _role: string) {
    this.clearRingTimeout(callId);

    const allCalls = await this.db.query<any[]>(`SELECT * FROM calls WHERE id = ?`, [callId]);
    if (!allCalls.length) throw new NotFoundException('Call not found');

    const existing = allCalls[0];
    if (existing.caller_id !== userId && existing.host_id !== userId) {
      throw new ForbiddenException('You are not a participant in this call');
    }

    if (existing.status !== 'ringing') {
      return { success: true, message: 'Call already handled' };
    }

    await this.db.query(
      `UPDATE calls SET status = 'rejected', ended_at = NOW() WHERE id = ? AND status = 'ringing'`,
      [callId],
    );

    const otherId = userId === existing.caller_id ? existing.host_id : existing.caller_id;
    this.socket.notifyUser(otherId, 'call_rejected', { call_id: callId });

    return { success: true, message: 'Call rejected' };
  }

  /** End call — always deduct from caller_id (male), host (female) earns */
  async end(callId: number, userId: number) {
    this.clearRingTimeout(callId);

    const pool = this.db.getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [calls] = await conn.query<any[]>(
        `SELECT * FROM calls WHERE id = ? FOR UPDATE`,
        [callId],
      );
      if (!calls.length) throw new NotFoundException('Call not found');

      const call = calls[0];
      if (call.caller_id !== userId && call.host_id !== userId) {
        throw new ForbiddenException('You are not a participant in this call');
      }

      if (call.status === 'ended') {
        await conn.commit();
        return {
          success: true,
          data: this.buildEndPayload(call),
        };
      }

      if (call.status !== 'active') {
        throw new BadRequestException('Call is not active');
      }

      const startedAtMs = call.started_at ? new Date(call.started_at).getTime() : Date.now();
      const durationSeconds = Math.max(
        0,
        Math.floor((Date.now() - (Number.isFinite(startedAtMs) ? startedAtMs : Date.now())) / 1000),
      );
      const commissionPct = this.platformSettings.getCommissionPercentage();
      const billing = calculateBilling(
        durationSeconds,
        parseFloat(call.rate_per_minute),
        commissionPct,
      );

      const [wallets] = await conn.query<any[]>(
        'SELECT balance FROM wallets WHERE user_id = ? AND status = ? FOR UPDATE',
        [call.caller_id, RECORD_STATUS.ACTIVE],
      );
      if (!wallets.length) {
        throw new BadRequestException('Caller wallet not found');
      }
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

      const [updateResult] = await conn.query<any>(
        `UPDATE calls SET status = 'ended', ended_at = NOW(), duration_seconds = ?,
         amount_deducted = ?, host_earning = ?, platform_commission = ? WHERE id = ? AND status = 'active'`,
        [
          durationSeconds,
          billing.totalAmount,
          billing.hostEarning,
          billing.platformCommission,
          call.id,
        ],
      );

      if (!(updateResult as { affectedRows?: number })?.affectedRows) {
        await conn.rollback();
        const endedRows = await this.db.query<any[]>(`SELECT * FROM calls WHERE id = ?`, [callId]);
        if (endedRows[0]?.status === 'ended') {
          return { success: true, data: this.buildEndPayload(endedRows[0]) };
        }
        throw new BadRequestException('Call is not active');
      }

      await conn.query(
        `INSERT INTO call_logs (call_id, caller_id, host_id, duration_seconds, amount_deducted, host_earning, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          call.id,
          call.caller_id,
          call.host_id,
          durationSeconds,
          billing.totalAmount,
          billing.hostEarning,
          RECORD_STATUS.ACTIVE,
        ],
      );

      await conn.query(
        `INSERT INTO earnings (host_id, call_id, amount, type, description, status) VALUES (?, ?, ?, 'call', ?, ?)`,
        [call.host_id, call.id, billing.hostEarning, `Call #${call.id}`, RECORD_STATUS.ACTIVE],
      );

      await conn.query(
        `UPDATE female_hosts SET total_calls = total_calls + 1,
         total_duration_seconds = total_duration_seconds + ? WHERE user_id = ?`,
        [durationSeconds, call.host_id],
      );

      await conn.commit();

      this.presence.clearUsersInCall(call.caller_id, call.host_id);
      await this.hostAvailability.onCallEnded(call.host_id);

      try {
        await this.hostDailyTask.evaluateAfterCall(call.host_id);
      } catch (err) {
        this.logger.warn(`daily task evaluate failed: ${(err as Error)?.message}`);
      }

      const endPayload = this.buildEndPayload(call, {
        durationSeconds,
        billableMinutes: billing.billableMinutes,
        totalAmount: billing.totalAmount,
        hostEarning: billing.hostEarning,
        platformCommission: billing.platformCommission,
      });

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

    const roomId = call.room_id;
    const token = this.safeGenerateToken(userId, roomId);

    return {
      success: true,
      data: {
        call_id: callId,
        room_id: roomId,
        zego_token: token,
        ...this.zegoToken.publicAppConfig(),
      },
    };
  }

  async getHistory(userId: number, role: string, page = 1, limit = 20) {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 20;
    const offset = (safePage - 1) * safeLimit;
    const isHost = role === 'female';
    const partnerCol = isHost ? 'caller_id' : 'host_id';
    const selfCol = isHost ? 'host_id' : 'caller_id';

    const logs = await this.db.query(
      `SELECT c.id as call_id, c.status, c.duration_seconds, c.amount_deducted, c.host_earning,
              c.created_at, c.started_at, c.ended_at, c.initiated_by, c.rate_per_minute,
              u.name as partner_name, u.avatar_url as partner_avatar
       FROM calls c
       JOIN users u ON u.id = c.${partnerCol}
       WHERE c.${selfCol} = ?
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, safeLimit, offset],
    );
    return { success: true, data: logs };
  }

  private scheduleMissedCallTimeout(
    callId: number,
    callerId: number,
    hostId: number,
    initiatedBy: 'male' | 'female',
  ) {
    this.clearRingTimeout(callId);

    const timeout = setTimeout(async () => {
      this.ringTimeouts.delete(callId);
      try {
        const rows = await this.db.query<any[]>(
          `SELECT status FROM calls WHERE id = ?`,
          [callId],
        );
        if (!rows.length || rows[0].status !== 'ringing') return;

        await this.db.query(
          `UPDATE calls SET status = 'missed', ended_at = NOW() WHERE id = ? AND status = 'ringing'`,
          [callId],
        );

        const initiatorId = initiatedBy === 'male' ? callerId : hostId;
        const receiverId = initiatedBy === 'male' ? hostId : callerId;

        this.socket.notifyUser(initiatorId, 'call_missed', {
          call_id: callId,
          reason: 'no_answer',
        });
        this.socket.notifyUser(receiverId, 'call_missed', {
          call_id: callId,
          reason: 'missed',
        });

        if (initiatedBy === 'male') {
          await this.hostAvailability.recordMissedIncomingCall(hostId);
        }
      } catch (err) {
        this.logger.warn(`missed call timeout failed for #${callId}: ${(err as Error)?.message}`);
      }
    }, RING_TIMEOUT_MS);

    this.ringTimeouts.set(callId, timeout);
  }

  private clearRingTimeout(callId: number) {
    const existing = this.ringTimeouts.get(callId);
    if (existing) clearTimeout(existing);
    this.ringTimeouts.delete(callId);
  }

  async adminClearAllCallsAndSessions() {
    for (const callId of [...this.ringTimeouts.keys()]) {
      this.clearRingTimeout(callId);
    }

    const [[countRow]] = await this.db.getPool().query<any[]>(
      'SELECT COUNT(*) as total FROM calls',
    );
    const deletedCalls = Number(countRow?.total ?? 0);
    const socketStats = this.presence.getStats();

    const pool = this.db.getPool();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');

      if (await this.hasTable('call_logs')) {
        await conn.query('TRUNCATE TABLE call_logs');
      }
      if (await this.hasTable('earnings')) {
        await conn.query('DELETE FROM earnings WHERE call_id IS NOT NULL');
      }
      await conn.query('TRUNCATE TABLE calls');

      await conn.query('SET FOREIGN_KEY_CHECKS = 1');

      await conn.query(
        `UPDATE female_hosts
         SET host_status = 'offline', consecutive_missed_calls = 0
         WHERE host_status != 'offline'`,
      );
      await conn.query(`UPDATE users SET is_online = 0 WHERE role != 'admin'`);

      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    this.presence.clearAllSessions();
    this.logger.warn(
      `Admin cleared ${deletedCalls} calls and ${socketStats.activeConnections} socket sessions`,
    );

    return {
      success: true,
      message: 'All calls deleted and socket sessions cleared.',
      data: {
        deleted_calls: deletedCalls,
        disconnected_sockets: socketStats.activeConnections,
      },
    };
  }

  private async hasTable(table: string): Promise<boolean> {
    const rows = await this.db.query<any[]>(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    );
    return rows.length > 0;
  }

  private createRoomId(): string {
    return `call_${uuidv4()}`;
  }

  private buildEndPayload(
    call: any,
    billing?: {
      durationSeconds: number;
      billableMinutes: number;
      totalAmount: number;
      hostEarning: number;
      platformCommission: number;
    },
  ) {
    const durationSeconds =
      billing?.durationSeconds ?? Math.max(0, parseInt(String(call.duration_seconds ?? 0), 10));
    const ratePerMinute = parseFloat(call.rate_per_minute);
    const amountDeducted = billing?.totalAmount ?? parseFloat(call.amount_deducted ?? 0);
    const hostEarning = billing?.hostEarning ?? parseFloat(call.host_earning ?? 0);
    const platformCommission =
      billing?.platformCommission ?? parseFloat(call.platform_commission ?? 0);
    const billableMinutes =
      billing?.billableMinutes ??
      (durationSeconds <= 0 ? 1 : Math.ceil(durationSeconds / 60));

    return {
      call_id: call.id,
      duration_seconds: durationSeconds,
      billable_minutes: billableMinutes,
      rate_per_minute: ratePerMinute,
      amount_deducted: amountDeducted,
      host_earning: hostEarning,
      platform_commission: platformCommission,
      paid_by: 'caller' as const,
    };
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
    hostAvatarUrl?: string;
    callerName?: string;
    callerAvatarUrl?: string;
  }) {
    return {
      call_id: params.callId,
      caller_id: params.callerId,
      host_id: params.hostId,
      room_id: params.roomId,
      rate_per_minute: params.ratePerMinute,
      host_level: params.hostLevel,
      initiated_by: params.initiatedBy,
      host_name: params.hostName ?? null,
      host_avatar_url: params.hostAvatarUrl ?? null,
      caller_name: params.callerName ?? null,
      caller_avatar_url: params.callerAvatarUrl ?? null,
      ...this.zegoToken.publicAppConfig(),
    };
  }

  private ensureZegoConfigured(): void {
    if (!this.zegoToken.isConfigured()) {
      this.logger.warn('Call blocked — ZEGOCLOUD_APP_ID / ZEGOCLOUD_SERVER_SECRET missing');
      throw new BadRequestException(
        'Voice calls are unavailable. ZEGOCLOUD is not configured on the server.',
      );
    }
  }

  private safeGenerateToken(userId: number, roomId: string): string | null {
    if (!this.zegoToken.isConfigured()) return null;
    return this.zegoToken.generateRoomToken(userId, roomId);
  }

  private async ensureCallerBalance(callerId: number, ratePerMinute: number) {
    const wallets = await this.db.query<any[]>(
      'SELECT balance FROM wallets WHERE user_id = ? AND status = ?',
      [callerId, RECORD_STATUS.ACTIVE],
    );
    if (parseFloat(wallets[0]?.balance || 0) < ratePerMinute) {
      throw new BadRequestException('Insufficient balance');
    }
  }

  private async cleanupStaleActiveCalls() {
    await this.presence.reconcileInCallState(this.db);

    const rows = await this.db.query<any[]>(
      `SELECT id, caller_id, host_id, started_at FROM calls WHERE status = 'active'`,
    );

    for (const call of rows) {
      const callerId = Number(call.caller_id);
      const hostId = Number(call.host_id);
      const startedAtMs = call.started_at ? new Date(call.started_at).getTime() : Date.now();
      const ageSeconds = Math.max(
        0,
        Math.floor((Date.now() - (Number.isFinite(startedAtMs) ? startedAtMs : Date.now())) / 1000),
      );

      if (ageSeconds < 300) continue;

      if (this.presence.isUserInCall(callerId) || this.presence.isUserInCall(hostId)) {
        continue;
      }
      if (this.socket.isUserOnline(callerId) || this.socket.isUserOnline(hostId)) {
        continue;
      }

      try {
        await this.end(call.id, callerId);
        this.logger.warn(`Ended stale active call #${call.id} after ${ageSeconds}s`);
      } catch (err) {
        await this.forceEndOrphanCall(Number(call.id), callerId, hostId);
        this.logger.warn(
          `Force-ended orphan call #${call.id}: ${(err as Error)?.message || err}`,
        );
      }
    }
  }

  private async forceEndOrphanCall(callId: number, callerId: number, hostId: number) {
    await this.db.query(
      `UPDATE calls SET status = 'ended', ended_at = NOW() WHERE id = ? AND status = 'active'`,
      [callId],
    );
    this.presence.clearUsersInCall(callerId, hostId);
    await this.hostAvailability.onCallEnded(hostId);
    const payload = { call_id: callId, reason: 'stale_cleanup' };
    this.socket.notifyUser(callerId, 'call_ended', payload);
    this.socket.notifyUser(hostId, 'call_ended', payload);
  }

  private async releaseStuckBusyHosts() {
    const rows = await this.db.query<{ user_id: number }[]>(
      `SELECT fh.user_id
       FROM female_hosts fh
       WHERE fh.host_status = 'busy'
         AND NOT EXISTS (
           SELECT 1 FROM calls c WHERE c.status = 'active' AND c.host_id = fh.user_id
         )`,
    );
    if (!rows.length) return;

    await this.db.query(
      `UPDATE female_hosts fh
       SET host_status = 'available'
       WHERE fh.host_status = 'busy'
         AND NOT EXISTS (
           SELECT 1 FROM calls c WHERE c.status = 'active' AND c.host_id = fh.user_id
         )`,
    );

    for (const row of rows) {
      this.socket.notifyRole('male', 'host_available', { host_id: Number(row.user_id) });
    }
  }
}
