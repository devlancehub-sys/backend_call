import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { FreeCallService } from './free-call.service';
import { ReferralsModule } from '../referrals/referrals.module';

@Module({
  imports: [ReferralsModule],
  controllers: [WalletController],
  providers: [WalletService, FreeCallService],
  exports: [WalletService, FreeCallService],
})
export class WalletModule {}
