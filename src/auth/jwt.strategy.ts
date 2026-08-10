import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';

interface JwtPayload {
  sub: number;
  deviceId: string;
  type: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-jwt-secret',
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.type !== 'user') {
      throw new UnauthorizedException('Invalid token type');
    }

    const valid = await this.authService.validateUser(
      payload.sub,
      payload.deviceId,
    );
    if (!valid) {
      throw new UnauthorizedException('Session expired');
    }

    return { userId: payload.sub, deviceId: payload.deviceId };
  }
}
