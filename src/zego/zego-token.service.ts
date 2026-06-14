import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateToken04 } from './zegoServerAssistant';

@Injectable()
export class ZegoTokenService {
  private readonly tokenTtlSeconds: number;

  constructor(private readonly config: ConfigService) {
    this.tokenTtlSeconds = parseInt(this.config.get('ZEGOCLOUD_TOKEN_TTL_SECONDS', '3600'), 10);
  }

  get appId(): number {
    return parseInt(this.config.get('ZEGOCLOUD_APP_ID', '0'), 10);
  }

  isConfigured(): boolean {
    const secret = this.config.get<string>('ZEGOCLOUD_SERVER_SECRET', '');
    return this.appId > 0 && secret.length === 32;
  }

  /** Server-side only — never expose ServerSecret to clients. */
  generateRoomToken(userId: string | number, roomId: string): string {
    const secret = this.config.get<string>('ZEGOCLOUD_SERVER_SECRET');
    if (!this.isConfigured() || !secret) {
      throw new BadRequestException('ZEGOCLOUD is not configured on the server');
    }

    const payload = JSON.stringify({
      room_id: roomId,
      privilege: {
        '1': 1,
        '2': 1,
      },
    });

    return generateToken04(
      this.appId,
      String(userId),
      secret,
      this.tokenTtlSeconds,
      payload,
    );
  }

  publicAppConfig() {
    return { zego_app_id: this.appId };
  }
}
