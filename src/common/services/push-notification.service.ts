import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { FcmV1Client } from './fcm-v1.client';

@Injectable()
export class PushNotificationService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationService.name);
  private fcmV1: FcmV1Client | null = null;

  constructor(
    private config: ConfigService,
    private db: DatabaseService,
  ) {}

  onModuleInit() {
    this.fcmV1 = new FcmV1Client({
      projectId: this.config.get<string>('FIREBASE_PROJECT_ID'),
      serviceAccountJson: this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON'),
      serviceAccountPath: this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH'),
    });

    if (this.fcmV1.isConfigured) {
      this.logger.log('FCM HTTP v1 API enabled');
      return;
    }

    const legacyKey = this.config.get<string>('FIREBASE_SERVER_KEY');
    if (legacyKey) {
      this.logger.warn(
        'Using legacy FIREBASE_SERVER_KEY — migrate to FCM v1 (service account)',
      );
      return;
    }

    this.logger.warn('Push notifications disabled — configure FCM v1 credentials');
  }

  get isConfigured(): boolean {
    return Boolean(this.fcmV1?.isConfigured || this.config.get<string>('FIREBASE_SERVER_KEY'));
  }

  async sendToUser(
    userId: number,
    title: string,
    body: string,
    data: Record<string, string>,
  ): Promise<boolean> {
    const rows = await this.db.query<any[]>(
      'SELECT fcm_token FROM users WHERE id = ? AND fcm_token IS NOT NULL AND fcm_token != ""',
      [userId],
    );
    const token = rows[0]?.fcm_token as string | undefined;
    if (!token) return false;
    return this.sendToToken(token, title, body, data);
  }

  async sendIncomingCall(hostId: number, payload: Record<string, unknown>): Promise<boolean> {
    const callerName = String(payload.caller_name ?? 'Caller');
    const data: Record<string, string> = {
      type: 'call_invite',
      call_id: String(payload.call_id ?? ''),
      caller_id: String(payload.caller_id ?? ''),
      host_id: String(payload.host_id ?? ''),
      room_id: String(payload.room_id ?? ''),
      rate_per_minute: String(payload.rate_per_minute ?? ''),
      caller_name: callerName,
      caller_avatar_url: String(payload.caller_avatar_url ?? ''),
      initiated_by: String(payload.initiated_by ?? 'male'),
      zego_app_id: String(payload.zego_app_id ?? ''),
    };

    return this.sendToUser(
      hostId,
      'Incoming Call',
      `${callerName} is calling you`,
      data,
    );
  }

  private async sendToToken(
    token: string,
    title: string,
    body: string,
    data: Record<string, string>,
  ): Promise<boolean> {
    if (this.fcmV1?.isConfigured) {
      return this.fcmV1.send({
        token,
        title,
        body,
        data,
        channelId: 'incoming_call',
      });
    }

    return this.sendLegacy(token, title, body, data);
  }

  /** @deprecated Legacy FCM API — use FIREBASE_SERVICE_ACCOUNT_JSON instead */
  private async sendLegacy(
    token: string,
    title: string,
    body: string,
    data: Record<string, string>,
  ): Promise<boolean> {
    const serverKey = this.config.get<string>('FIREBASE_SERVER_KEY');
    if (!serverKey) {
      this.logger.warn('FCM credentials not set — push skipped');
      return false;
    }

    try {
      const response = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `key=${serverKey}`,
        },
        body: JSON.stringify({
          to: token,
          priority: 'high',
          content_available: true,
          data,
          notification: {
            title,
            body,
            sound: 'default',
            priority: 'high',
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        this.logger.warn(`FCM legacy push failed (${response.status}): ${text}`);
        return false;
      }

      return true;
    } catch (err) {
      this.logger.warn(`FCM legacy push error: ${(err as Error)?.message || err}`);
      return false;
    }
  }
}
