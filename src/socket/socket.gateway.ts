import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OnlineUserManagerService } from './online-user-manager.service';

@WebSocketGateway({
  cors: { origin: '*' },
  transports: ['websocket'],
  pingInterval: 25_000,
  pingTimeout: 20_000,
  connectTimeout: 15_000,
  maxHttpBufferSize: 1e5,
  perMessageDeflate: false,
})
export class SocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SocketGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly presence: OnlineUserManagerService,
  ) {}

  afterInit(server: Server) {
    this.presence.attachServer(server);
    this.logger.log('Socket.IO gateway initialized');
  }

  async handleConnection(@ConnectedSocket() client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = this.jwt.verify(token, {
        secret: this.config.get('JWT_SECRET'),
      }) as { id: number; role: string };

      const userId = Number(payload.id);
      const role = payload.role;
      if (!userId || !role) {
        client.disconnect(true);
        return;
      }

      client.data.userId = userId;
      client.data.userRole = role;

      const { isReconnect, replacedSocketId } = this.presence.registerConnection(
        userId,
        client.id,
        role,
      );

      if (replacedSocketId) {
        client.data.replacedSocket = true;
      }

      client.join(`user:${userId}`);
      if (role === 'female') client.join('role:female');
      else if (role === 'male') client.join('role:male');

      this.presence.emitPresenceOnline(userId, role, isReconnect);
    } catch (err) {
      this.logger.warn(`Connection rejected: ${(err as Error)?.message || err}`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(@ConnectedSocket() client: Socket) {
    this.presence.handleDisconnect(client.id);
  }

  /** App-level heartbeat — updates last-seen; Socket.IO ping/pong handles transport health. */
  @SubscribeMessage('presence_ping')
  handlePresencePing(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId as number | undefined;
    if (!userId) return { ok: false };
    this.presence.touchHeartbeat(userId);
    return { ok: true, ts: Date.now() };
  }

  @SubscribeMessage('incoming_call')
  handleIncomingCall(@ConnectedSocket() client: Socket, data: { host_id: number }) {
    this.emitToUserRoom(data.host_id, 'incoming_call', data);
  }

  @SubscribeMessage('call_accepted')
  handleCallAccepted(
    @ConnectedSocket() client: Socket,
    data: { caller_id: number; host_id?: number },
  ) {
    this.emitToUserRoom(data.caller_id, 'call_accepted', data);
    if (data.host_id) this.emitToUserRoom(data.host_id, 'call_accepted', data);
  }

  @SubscribeMessage('call_rejected')
  handleCallRejected(
    @ConnectedSocket() client: Socket,
    data: { caller_id: number; host_id?: number },
  ) {
    this.emitToUserRoom(data.caller_id, 'call_rejected', data);
    if (data.host_id) this.emitToUserRoom(data.host_id, 'call_rejected', data);
  }

  @SubscribeMessage('call_ended')
  handleCallEnded(
    @ConnectedSocket() client: Socket,
    data: { caller_id?: number; host_id?: number; call_id?: number },
  ) {
    if (data.caller_id) this.emitToUserRoom(data.caller_id, 'call_ended', data);
    if (data.host_id) this.emitToUserRoom(data.host_id, 'call_ended', data);
  }

  @SubscribeMessage('wallet_updated')
  handleWalletUpdated(@ConnectedSocket() client: Socket, data: { user_id: number }) {
    this.emitToUserRoom(data.user_id, 'wallet_updated', data);
  }

  @SubscribeMessage('earning_updated')
  handleEarningUpdated(@ConnectedSocket() client: Socket, data: { host_id: number }) {
    this.emitToUserRoom(data.host_id, 'earning_updated', data);
  }

  notifyUser(userId: number, event: string, data: Record<string, unknown>): boolean {
    return this.presence.emitToUser(userId, event, data);
  }

  isUserOnline(userId: number): boolean {
    return this.presence.isUserOnline(userId);
  }

  isUserInCall(userId: number): boolean {
    return this.presence.isUserInCall(userId);
  }

  getPresenceStats() {
    return this.presence.getStats();
  }

  private emitToUserRoom(userId: number, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
