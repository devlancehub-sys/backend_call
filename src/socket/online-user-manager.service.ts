import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Server } from 'socket.io';
import { DatabaseService } from '../database/database.service';
import { RECORD_STATUS } from '../common/constants/record-status';

export type UserRole = 'male' | 'female' | 'admin' | string;

export interface OnlineSession {
  userId: number;
  socketId: string;
  role: UserRole;
  connectedAt: Date;
  lastSeenAt: Date;
}

export interface ConnectionResult {
  isReconnect: boolean;
  replacedSocketId: string | null;
}

export interface PresenceStats {
  activeConnections: number;
  onlineMales: number;
  onlineFemales: number;
  onlineAdmins: number;
}

@Injectable()
export class OnlineUserManagerService implements OnModuleDestroy {
  private readonly logger = new Logger(OnlineUserManagerService.name);

  /** userId → active session */
  private readonly sessions = new Map<number, OnlineSession>();
  /** socketId → userId (fast disconnect lookup) */
  private readonly socketIndex = new Map<string, number>();
  /** Grace-period timers before marking a user offline */
  private readonly offlineTimers = new Map<number, NodeJS.Timeout>();
  /** Debounced DB presence sync timers */
  private readonly dbSyncTimers = new Map<number, NodeJS.Timeout>();

  private server: Server | null = null;
  private staleSweepTimer: NodeJS.Timeout | null = null;

  private readonly offlineGraceMs = Number(process.env.SOCKET_OFFLINE_GRACE_MS) || 3_000;
  private readonly dbSyncDebounceMs = Number(process.env.SOCKET_DB_SYNC_MS) || 5_000;
  private readonly staleSweepMs = Number(process.env.SOCKET_STALE_SWEEP_MS) || 60_000;

  constructor(private readonly db: DatabaseService) {}

  attachServer(server: Server) {
    this.server = server;
    this.startStaleSweep();
    this.logger.log('Online user manager attached to Socket.IO server');
  }

  registerConnection(
    userId: number,
    socketId: string,
    role: UserRole,
  ): ConnectionResult {
    this.clearOfflineTimer(userId);
    this.clearDbSyncTimer(userId);

    const existing = this.sessions.get(userId);
    const isReconnect = Boolean(existing);
    let replacedSocketId: string | null = null;

    if (existing && existing.socketId !== socketId) {
      replacedSocketId = existing.socketId;
      this.socketIndex.delete(existing.socketId);
      this.disconnectSocket(existing.socketId, 'replaced_by_new_session');
    }

    const now = new Date();
    const session: OnlineSession = {
      userId,
      socketId,
      role,
      connectedAt: now,
      lastSeenAt: now,
    };

    this.sessions.set(userId, session);
    this.socketIndex.set(socketId, userId);

    this.scheduleDbPresenceSync(userId, true);

    const stats = this.getStats();
    if (isReconnect) {
      this.logger.log(
        `Reconnected user ${userId} (${role}) socket=${socketId} | active=${stats.activeConnections}`,
      );
    } else {
      this.logger.log(
        `User connected ${userId} (${role}) socket=${socketId} | active=${stats.activeConnections}`,
      );
    }

    return { isReconnect, replacedSocketId };
  }

  /** Returns true when this socket was the active session and user went offline. */
  handleDisconnect(socketId: string): boolean {
    const userId = this.socketIndex.get(socketId);
    if (userId == null) return false;

    const session = this.sessions.get(userId);
    if (!session || session.socketId !== socketId) return false;

    this.socketIndex.delete(socketId);
    this.clearOfflineTimer(userId);

    this.offlineTimers.set(
      userId,
      setTimeout(() => this.finalizeOffline(userId, session), this.offlineGraceMs),
    );

    this.logger.debug(
      `Disconnect grace started for user ${userId} (${this.offlineGraceMs}ms)`,
    );
    return true;
  }

  touchHeartbeat(userId: number) {
    const session = this.sessions.get(userId);
    if (!session) return;
    session.lastSeenAt = new Date();
  }

  isUserOnline(userId: number): boolean {
    const session = this.sessions.get(userId);
    if (!session || !this.server) return false;
    return this.server.sockets.sockets.has(session.socketId);
  }

  getSession(userId: number): OnlineSession | undefined {
    return this.sessions.get(userId);
  }

  getSocketId(userId: number): string | undefined {
    return this.sessions.get(userId)?.socketId;
  }

  getStats(): PresenceStats {
    let onlineMales = 0;
    let onlineFemales = 0;
    let onlineAdmins = 0;

    for (const session of this.sessions.values()) {
      if (session.role === 'male') onlineMales++;
      else if (session.role === 'female') onlineFemales++;
      else if (session.role === 'admin') onlineAdmins++;
    }

    return {
      activeConnections: this.sessions.size,
      onlineMales,
      onlineFemales,
      onlineAdmins,
    };
  }

  emitToUser(userId: number, event: string, data: Record<string, unknown>): boolean {
    if (!this.server || !this.isUserOnline(userId)) return false;
    this.server.to(`user:${userId}`).emit(event, data);
    return true;
  }

  emitPresenceOnline(userId: number, role: UserRole, isReconnect: boolean) {
    if (!this.server || isReconnect) return;

    if (role === 'female') {
      this.server.to('role:male').emit('host_online', { host_id: userId });
    } else if (role === 'male') {
      this.server.to('role:female').emit('user_online', { user_id: userId });
    }
  }

  emitPresenceOffline(userId: number, role: UserRole) {
    if (!this.server) return;

    if (role === 'female') {
      this.server.to('role:male').emit('host_offline', { host_id: userId });
    } else if (role === 'male') {
      this.server.to('role:female').emit('user_offline', { user_id: userId });
    }
  }

  private finalizeOffline(userId: number, session: OnlineSession) {
    this.offlineTimers.delete(userId);

    const current = this.sessions.get(userId);
    if (current && current.socketId === session.socketId) {
      this.sessions.delete(userId);
    }

    this.scheduleDbPresenceSync(userId, false);
    this.emitPresenceOffline(userId, session.role);

    const stats = this.getStats();
    this.logger.log(
      `User disconnected ${userId} (${session.role}) | active=${stats.activeConnections}`,
    );
  }

  private scheduleDbPresenceSync(userId: number, isOnline: boolean) {
    this.clearDbSyncTimer(userId);

    this.dbSyncTimers.set(
      userId,
      setTimeout(() => {
        this.dbSyncTimers.delete(userId);
        this.syncPresenceToDatabase(userId, isOnline).catch((err) =>
          this.logger.warn(
            `DB presence sync failed for user ${userId}: ${(err as Error)?.message || err}`,
          ),
        );
      }, isOnline ? this.dbSyncDebounceMs : 0),
    );
  }

  private async syncPresenceToDatabase(userId: number, isOnline: boolean) {
    await this.db.query(
      `UPDATE users SET is_online = ?, last_seen_at = NOW()
       WHERE id = ? AND status = ?`,
      [isOnline ? 1 : 0, userId, RECORD_STATUS.ACTIVE],
    );
  }

  private disconnectSocket(socketId: string, reason: string) {
    if (!this.server) return;
    const socket = this.server.sockets.sockets.get(socketId);
    if (socket) {
      this.logger.debug(`Disconnecting stale socket ${socketId} (${reason})`);
      socket.disconnect(true);
    }
  }

  private startStaleSweep() {
    if (this.staleSweepTimer) return;

    this.staleSweepTimer = setInterval(() => {
      if (!this.server) return;

      for (const [userId, session] of this.sessions) {
        if (!this.server.sockets.sockets.has(session.socketId)) {
          this.logger.warn(`Stale session removed user=${userId} socket=${session.socketId}`);
          this.clearOfflineTimer(userId);
          this.sessions.delete(userId);
          this.socketIndex.delete(session.socketId);
          this.scheduleDbPresenceSync(userId, false);
          this.emitPresenceOffline(userId, session.role);
        }
      }
    }, this.staleSweepMs);
  }

  private clearOfflineTimer(userId: number) {
    const timer = this.offlineTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.offlineTimers.delete(userId);
    }
  }

  private clearDbSyncTimer(userId: number) {
    const timer = this.dbSyncTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.dbSyncTimers.delete(userId);
    }
  }

  onModuleDestroy() {
    if (this.staleSweepTimer) {
      clearInterval(this.staleSweepTimer);
      this.staleSweepTimer = null;
    }

    for (const timer of this.offlineTimers.values()) clearTimeout(timer);
    for (const timer of this.dbSyncTimers.values()) clearTimeout(timer);

    this.offlineTimers.clear();
    this.dbSyncTimers.clear();
    this.sessions.clear();
    this.socketIndex.clear();

    this.logger.log('Online user manager destroyed — all sessions cleared');
  }
}
