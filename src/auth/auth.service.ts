import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { DatabaseService } from '../database/database.service';
import { RegisterDeviceDto, RefreshTokenDto } from './dto/auth.dto';

interface DeviceRow extends RowDataPacket {
  id: number;
  user_id: number;
  device_id: string;
}

interface DeviceUserRow extends RowDataPacket {
  user_id: number;
  name: string;
}

interface UserRow extends RowDataPacket {
  id: number;
  name: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async registerDevice(dto: RegisterDeviceDto) {
    const [existingDevices] = await this.db.query<DeviceUserRow[]>(
      `SELECT d.user_id, u.name
       FROM devices d
       JOIN users u ON u.id = d.user_id
       WHERE d.device_id = ?
       LIMIT 1`,
      [dto.deviceId],
    );

    if (existingDevices[0]) {
      const user = existingDevices[0];
      const token = this.signUserToken(user.user_id, dto.deviceId);
      return {
        token,
        user: { id: user.user_id, name: user.name },
      };
    }

    const connection = await this.db.getPool().getConnection();
    try {
      await connection.beginTransaction();

      const [userResult] = await connection.query<ResultSetHeader>(
        'INSERT INTO users (name) VALUES (?)',
        ['User'],
      );
      const userId = userResult.insertId;

      await connection.query(
        'INSERT INTO wallets (user_id, balance) VALUES (?, 0)',
        [userId],
      );

      await connection.query(
        'INSERT INTO devices (user_id, device_id) VALUES (?, ?)',
        [userId, dto.deviceId],
      );

      await connection.commit();

      const token = this.signUserToken(userId, dto.deviceId);
      return { token, user: { id: userId, name: 'User' } };
    } catch (error) {
      await connection.rollback();
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw new ConflictException('Device already registered');
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async refreshToken(userId: number, dto: RefreshTokenDto) {
    const [devices] = await this.db.query<DeviceRow[]>(
      'SELECT id FROM devices WHERE user_id = ? AND device_id = ? LIMIT 1',
      [userId, dto.deviceId],
    );

    if (!devices[0]) {
      throw new UnauthorizedException('Device not linked to this account');
    }

    const token = this.signUserToken(userId, dto.deviceId);
    return { token };
  }

  async validateUser(userId: number, deviceId: string): Promise<boolean> {
    const [devices] = await this.db.query<DeviceRow[]>(
      'SELECT id FROM devices WHERE user_id = ? AND device_id = ? LIMIT 1',
      [userId, deviceId],
    );
    return !!devices[0];
  }

  async getUserById(userId: number): Promise<UserRow | null> {
    const [rows] = await this.db.query<UserRow[]>(
      'SELECT id, name FROM users WHERE id = ? LIMIT 1',
      [userId],
    );
    return rows[0] || null;
  }

  signUserToken(userId: number, deviceId: string): string {
    return this.jwt.sign(
      { sub: userId, deviceId, type: 'user' },
      {
        secret: this.config.get<string>('JWT_SECRET') ?? 'dev-jwt-secret',
        expiresIn: this.config.get('JWT_EXPIRES_IN') ?? '30d',
      },
    );
  }
}
