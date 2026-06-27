import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { FreeCallService } from './free-call.service';

@Module({
  controllers: [WalletController],
  providers: [WalletService, FreeCallService],
  exports: [WalletService, FreeCallService],
})
export class WalletModule {}
