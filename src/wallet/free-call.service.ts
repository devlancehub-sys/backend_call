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

  async hostOffersFreeCall(hostId: number): Promise<boolean> {
    const rows = await this.db.query<any[]>(
      `SELECT offers_free_call FROM female_hosts
       WHERE user_id = ? AND status = ?`,
      [hostId, RECORD_STATUS.ACTIVE],
    );
    return !!rows[0]?.offers_free_call;
  }

  async getHostFreeCallOffer(hostId: number) {
    const offers = await this.hostOffersFreeCall(hostId);
    return {
      success: true,
      data: {
        offers_free_call: offers,
        free_call_minutes: offers ? 1 : 0,
      },
    };
  }

  async setHostFreeCallOffer(hostId: number, enabled: boolean) {
    await this.db.query(
      `UPDATE female_hosts SET offers_free_call = ? WHERE user_id = ? AND status = ?`,
      [enabled ? 1 : 0, hostId, RECORD_STATUS.ACTIVE],
    );
    return this.getHostFreeCallOffer(hostId);
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

  async canUseFreeCallWithHost(userId: number, hostId: number): Promise<boolean> {
    if (!(await this.hostOffersFreeCall(hostId))) return false;
    return this.isAvailable(userId);
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
