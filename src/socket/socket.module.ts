import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SocketGateway } from './socket.gateway';
import { OnlineUserManagerService } from './online-user-manager.service';
import { FollowsModule } from '../follows/follows.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
      }),
    }),
    FollowsModule,
  ],
  providers: [OnlineUserManagerService, SocketGateway],
  exports: [SocketGateway, OnlineUserManagerService],
})
export class SocketModule {}
