import { Module } from '@nestjs/common';
import { HostAccessKeyModule } from '../host-access-key/host-access-key.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [HostAccessKeyModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
