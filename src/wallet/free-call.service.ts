import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RECORD_STATUS } from '../common/constants/record-status';
import { FREE_CALL_MAX_SECONDS } from '../common/utils/billing.util';

export type CallerDeviceIdentity = {
  device_id: string;
  fcm_token: string;
};

@Injectable()
export class FreeCallService {
  constructor(private db: DatabaseService) {}

  getFreeCallMaxSeconds() {
    return FREE_CALL_MAX_SECONDS;
  }

  async getCallerDeviceIdentity(userId: number): Promise<CallerDeviceIdentity | null> {
    const rows = await this.db.query<any[]>(
      `SELECT device_id, fcm_token FROM users
       WHERE id = ? AND role = 'male' AND status = ?`,
      [userId, RECORD_STATUS.ACTIVE],
    );
    const deviceId = rows[0]?.device_id?.toString()?.trim();
    const fcmToken = rows[0]?.fcm_token?.toString()?.trim();
    if (!deviceId || !fcmToken) return null;
    return { device_id: deviceId, fcm_token: fcmToken };
  }

  async isAvailable(userId: number): Promise<boolean> {
    const identity = await this.getCallerDeviceIdentity(userId);
    if (!identity) return false;
    return this.isAvailableForDevice(identity.device_id, identity.fcm_token);
  }

  async isAvailableForDevice(deviceId: string, fcmToken: string): Promise<boolean> {
    const rows = await this.db.query<any[]>(
      `SELECT id FROM free_call_redemptions
       WHERE device_id = ? AND fcm_token = ? LIMIT 1`,
      [deviceId, fcmToken],
    );
    return rows.length === 0;
  }

  async redeem(params: {
    deviceId: string;
    fcmToken: string;
    userId: number;
    callId: number;
  }) {
    await this.db.query(
      `INSERT INTO free_call_redemptions (device_id, fcm_token, user_id, call_id)
       VALUES (?, ?, ?, ?)`,
      [params.deviceId, params.fcmToken, params.userId, params.callId],
    );
  }
}
