import { Module } from '@nestjs/common';
import { AdminPromoCodesController, PromoCodesController } from './promo-codes.controller';
import { PromoCodesService } from './promo-codes.service';

@Module({
  controllers: [PromoCodesController, AdminPromoCodesController],
  providers: [PromoCodesService],
})
export class PromoCodesModule {}
