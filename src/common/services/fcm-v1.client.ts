import { readFileSync } from 'fs';
import { GoogleAuth } from 'google-auth-library';
import { Logger } from '@nestjs/common';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

export type FcmV1Message = {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
  channelId?: string;
};

export class FcmV1Client {
  private readonly logger = new Logger(FcmV1Client.name);
  private auth: GoogleAuth | null = null;
  private projectId: string | null = null;

  constructor(
    private readonly options: {
      projectId?: string;
      serviceAccountJson?: string;
      serviceAccountPath?: string;
    },
  ) {
    this.projectId = options.projectId?.trim() || null;
    this.auth = this.buildAuth();
  }

  get isConfigured(): boolean {
    return Boolean(this.auth && this.projectId);
  }

  async send(message: FcmV1Message): Promise<boolean> {
    if (!this.auth || !this.projectId) {
      this.logger.warn('FCM v1 not configured — set FIREBASE_PROJECT_ID and service account');
      return false;
    }

    try {
      const client = await this.auth.getClient();
      const tokenResponse = await client.getAccessToken();
      const accessToken = tokenResponse.token;
      if (!accessToken) {
        this.logger.warn('FCM v1 access token unavailable');
        return false;
      }

      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: message.token,
              notification: {
                title: message.title,
                body: message.body,
              },
              data: message.data,
              android: {
                priority: 'HIGH',
                notification: {
                  channel_id: message.channelId ?? 'incoming_call',
                  sound: 'default',
                  notification_priority: 'PRIORITY_MAX',
                },
              },
              apns: {
                headers: {
                  'apns-priority': '10',
                },
                payload: {
                  aps: {
                    sound: 'default',
                    contentAvailable: true,
                  },
                },
              },
            },
          }),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        this.logger.warn(`FCM v1 push failed (${response.status}): ${text}`);
        return false;
      }

      return true;
    } catch (err) {
      this.logger.warn(`FCM v1 push error: ${(err as Error)?.message || err}`);
      return false;
    }
  }

  private buildAuth(): GoogleAuth | null {
    const credentials = this.loadCredentials();
    if (!credentials) return null;

    const projectId =
      this.projectId ||
      (typeof credentials.project_id === 'string' ? credentials.project_id : null);
    if (!projectId) {
      this.logger.warn('FIREBASE_PROJECT_ID missing and not found in service account JSON');
      return null;
    }
    this.projectId = projectId;

    return new GoogleAuth({
      credentials,
      scopes: [FCM_SCOPE],
    });
  }

  private loadCredentials(): Record<string, unknown> | null {
    const inline = this.options.serviceAccountJson?.trim();
    if (inline) {
      try {
        return JSON.parse(inline) as Record<string, unknown>;
      } catch {
        this.logger.error('FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON');
        return null;
      }
    }

    const path = this.options.serviceAccountPath?.trim();
    if (path) {
      try {
        return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      } catch (err) {
        this.logger.error(
          `Failed to read FIREBASE_SERVICE_ACCOUNT_PATH (${path}): ${(err as Error)?.message || err}`,
        );
        return null;
      }
    }

    return null;
  }
}
