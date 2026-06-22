import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { HostAccessKeyService } from '../common/services/host-access-key.service';

@Module({
  imports: [UsersModule, AuthModule],
  providers: [HostAccessKeyService],
  exports: [HostAccessKeyService],
})
export class HostAccessKeyModule {}
