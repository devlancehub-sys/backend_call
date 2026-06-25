import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HostsModule } from './hosts/hosts.module';
import { CallersModule } from './callers/callers.module';
import { WalletModule } from './wallet/wallet.module';
import { CallsModule } from './calls/calls.module';
import { EarningsModule } from './earnings/earnings.module';
import { WithdrawModule } from './withdraw/withdraw.module';
import { LanguagesModule } from './languages/languages.module';
import { AdminModule } from './admin/admin.module';
import { SocketModule } from './socket/socket.module';
import { HostAuthModule } from './host-auth/host-auth.module';
import { PromoCodesModule } from './promo-codes/promo-codes.module';
import { PushModule } from './common/push.module';
import { AppController } from './app.controller';

@Module({
  // This is the main module that will be used to bootstrap the application.
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 200 }]),
    // DatabaseModule is used to connect to the database.
    DatabaseModule,
    AuthModule,
    UsersModule,
    HostsModule,
    CallersModule,
    WalletModule,
    CallsModule,
    EarningsModule,
    WithdrawModule,
    LanguagesModule,
    AdminModule,
    SocketModule,
    HostAuthModule,
    PromoCodesModule,
    PushModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
