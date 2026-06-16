import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';

@WebSocketGateway({
  cors: { origin: '*' },
  pingInterval: 25_000,
  pingTimeout: 20_000,
  maxHttpBufferSize: 1e5,
})
export class SocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SocketGateway.name);

  @WebSocketServer()
  server: Server;

  private onlineUsers = new Map<number, string>();

  constructor(
    private jwt: JwtService,
    private config: ConfigService,
    private db: DatabaseService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      if (!token) return client.disconnect();

      const payload = this.jwt.verify(token, { secret: this.config.get('JWT_SECRET') }) as any;
      const userId = payload.id as number;
      const role = payload.role as string;

      client.data.userId = userId;
      client.data.userRole = role;

      // Replace stale socket for the same user (reconnect / duplicate tab).
      const previousSocketId = this.onlineUsers.get(userId);
      if (previousSocketId && previousSocketId !== client.id) {
        this.server.sockets.sockets.get(previousSocketId)?.disconnect(true);
      }

      this.onlineUsers.set(userId, client.id);
      client.join(`user:${userId}`);
      if (role === 'female') {
        client.join('role:female');
      } else if (role === 'male') {
        client.join('role:male');
      }

      // Presence is tracked in-memory for routing; DB sync is best-effort only.
      this.db
        .query('UPDATE users SET is_online = 1, last_seen_at = NOW() WHERE id = ?', [userId])
        .catch((err) =>
          this.logger.warn(`Could not mark user ${userId} online: ${(err as Error)?.message || err}`),
        );

      if (role === 'female') {
        this.server.to('role:male').emit('host_online', { host_id: userId });
      } else if (role === 'male') {
        this.server.to('role:female').emit('user_online', { user_id: userId });
      }
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId as number | undefined;
    const role = client.data.userRole as string | undefined;
    if (!userId) return;

    // Ignore disconnect from a replaced/stale socket.
    if (this.onlineUsers.get(userId) !== client.id) return;

    this.onlineUsers.delete(userId);

    this.db
      .query('UPDATE users SET is_online = 0, last_seen_at = NOW() WHERE id = ?', [userId])
      .catch((err) =>
        this.logger.warn(`Could not mark user ${userId} offline: ${(err as Error)?.message || err}`),
      );

    if (role === 'female') {
      this.server.to('role:male').emit('host_offline', { host_id: userId });
    } else if (role === 'male') {
      this.server.to('role:female').emit('user_offline', { user_id: userId });
    }
  }

  @SubscribeMessage('incoming_call')
  handleIncomingCall(_client: Socket, data: { host_id: number }) {
    this.server.to(`user:${data.host_id}`).emit('incoming_call', data);
  }

  @SubscribeMessage('call_accepted')
  handleCallAccepted(_client: Socket, data: { caller_id: number; host_id?: number }) {
    this.server.to(`user:${data.caller_id}`).emit('call_accepted', data);
    if (data.host_id) {
      this.server.to(`user:${data.host_id}`).emit('call_accepted', data);
    }
  }

  @SubscribeMessage('call_rejected')
  handleCallRejected(_client: Socket, data: { caller_id: number; host_id?: number }) {
    this.server.to(`user:${data.caller_id}`).emit('call_rejected', data);
    if (data.host_id) {
      this.server.to(`user:${data.host_id}`).emit('call_rejected', data);
    }
  }

  @SubscribeMessage('call_ended')
  handleCallEnded(_client: Socket, data: { caller_id?: number; host_id?: number; call_id?: number }) {
    if (data.caller_id) {
      this.server.to(`user:${data.caller_id}`).emit('call_ended', data);
    }
    if (data.host_id) {
      this.server.to(`user:${data.host_id}`).emit('call_ended', data);
    }
  }

  @SubscribeMessage('wallet_updated')
  handleWalletUpdated(_client: Socket, data: { user_id: number }) {
    this.server.to(`user:${data.user_id}`).emit('wallet_updated', data);
  }

  @SubscribeMessage('earning_updated')
  handleEarningUpdated(_client: Socket, data: { host_id: number }) {
    this.server.to(`user:${data.host_id}`).emit('earning_updated', data);
  }

  /** Push event to a specific user (e.g. boy gets call when girl initiates) */
  notifyUser(userId: number, event: string, data: Record<string, unknown>): boolean {
    const socketId = this.onlineUsers.get(userId);
    if (socketId) {
      this.server.to(socketId).emit(event, data);
      return true;
    }
    return false;
  }

  isUserOnline(userId: number): boolean {
    return this.onlineUsers.has(userId);
  }
}
