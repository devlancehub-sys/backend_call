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

@WebSocketGateway({ cors: { origin: '*' } })
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
      client.data.userId = payload.id;
      client.data.userRole = payload.role;
      this.onlineUsers.set(payload.id, client.id);

      try {
        await this.db.query('UPDATE users SET is_online = 1, last_seen_at = NOW() WHERE id = ?', [
          payload.id,
        ]);
      } catch (err) {
        this.logger.warn(`Could not mark user ${payload.id} online: ${(err as Error)?.message || err}`);
      }

      if (payload.role === 'female') {
        this.server.emit('host_online', { host_id: payload.id });
      } else {
        this.server.emit('user_online', { user_id: payload.id });
      }
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    const role = client.data.userRole;
    if (!userId) return;

    this.onlineUsers.delete(userId);
    try {
      await this.db.query('UPDATE users SET is_online = 0, last_seen_at = NOW() WHERE id = ?', [userId]);
    } catch (err) {
      this.logger.warn(`Could not mark user ${userId} offline: ${(err as Error)?.message || err}`);
    }

    if (role === 'female') {
      this.server.emit('host_offline', { host_id: userId });
    } else {
      this.server.emit('user_offline', { user_id: userId });
    }
  }

  @SubscribeMessage('incoming_call')
  handleIncomingCall(_client: Socket, data: { host_id: number }) {
    const hostSocketId = this.onlineUsers.get(data.host_id);
    if (hostSocketId) {
      this.server.to(hostSocketId).emit('incoming_call', data);
    }
  }

  @SubscribeMessage('call_accepted')
  handleCallAccepted(_client: Socket, data: { caller_id: number }) {
    const callerSocketId = this.onlineUsers.get(data.caller_id);
    if (callerSocketId) {
      this.server.to(callerSocketId).emit('call_accepted', data);
    }
    this.server.emit('call_started', data);
  }

  @SubscribeMessage('call_rejected')
  handleCallRejected(_client: Socket, data: { caller_id: number }) {
    const callerSocketId = this.onlineUsers.get(data.caller_id);
    if (callerSocketId) {
      this.server.to(callerSocketId).emit('call_rejected', data);
    }
  }

  @SubscribeMessage('call_ended')
  handleCallEnded(_client: Socket, data: any) {
    this.server.emit('call_ended', data);
  }

  @SubscribeMessage('wallet_updated')
  handleWalletUpdated(_client: Socket, data: { user_id: number }) {
    const socketId = this.onlineUsers.get(data.user_id);
    if (socketId) this.server.to(socketId).emit('wallet_updated', data);
  }

  @SubscribeMessage('earning_updated')
  handleEarningUpdated(_client: Socket, data: { host_id: number }) {
    const socketId = this.onlineUsers.get(data.host_id);
    if (socketId) this.server.to(socketId).emit('earning_updated', data);
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
