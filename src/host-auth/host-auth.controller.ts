import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { HostAccessKeyService } from '../common/services/host-access-key.service';
import { HostAuthService } from './host-auth.service';
import { CreateHostDto, HostLoginDto, VerifyAccessKeyDto } from './dto/host-auth.dto';

@ApiTags('Host Auth')
@Controller('auth/host')
export class HostAuthController {
  constructor(
    private hostAuth: HostAuthService,
    private hostAccessKey: HostAccessKeyService,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Girls app — host login (admin-created accounts only)' })
  login(@Body() dto: HostLoginDto) {
    return this.hostAuth.login(dto);
  }

  @Post('verify-access-key')
  @ApiOperation({
    summary: 'Verify stored access key and return profile (reduces profile API calls on app launch)',
  })
  verifyAccessKey(@Body() dto: VerifyAccessKeyDto) {
    return this.hostAccessKey.verifyAccessKey(dto.access_key, dto.profile_version);
  }
}

@ApiTags('Admin Hosts')
@ApiSecurity('admin-key')
@Controller('admin/hosts')
@UseGuards(AdminApiKeyGuard)
export class AdminHostsController {
  constructor(private hostAuth: HostAuthService) {}

  @Post()
  @ApiOperation({ summary: 'Admin creates host username + password' })
  createHost(@Body() dto: CreateHostDto) {
    return this.hostAuth.createHost(dto);
  }
}
