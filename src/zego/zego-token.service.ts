import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateToken04 } from './zegoServerAssistant';

@Injectable()
export class ZegoTokenService implements OnModuleInit {
  private readonly logger = new Logger(ZegoTokenService.name);
  private readonly tokenTtlSeconds: number;

  constructor(private readonly config: ConfigService) {
    this.tokenTtlSeconds = parseInt(this.config.get('ZEGOCLOUD_TOKEN_TTL_SECONDS', '3600'), 10);
  }

  onModuleInit() {
    if (this.isConfigured()) {
      this.logger.log(`ZEGOCLOUD ready — app_id=${this.appId}, token_ttl=${this.tokenTtlSeconds}s`);
      return;
    }
    this.logger.warn(
      'ZEGOCLOUD not configured — voice calls disabled. Set ZEGOCLOUD_APP_ID and 32-char ZEGOCLOUD_SERVER_SECRET in Railway/host env.',
    );
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

    try {
      return generateToken04(
        this.appId,
        String(userId),
        secret,
        this.tokenTtlSeconds,
        payload,
      );
    } catch (err: unknown) {
      const info = err as { errorMessage?: string; message?: string };
      const detail = info?.errorMessage || info?.message || 'token error';
      throw new BadRequestException(`Voice call could not start. ZEGOCLOUD ${detail}`);
    }
  }

  publicAppConfig() {
    return { zego_app_id: this.appId };
  }
}
