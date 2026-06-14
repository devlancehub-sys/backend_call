import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { HostAuthService } from './host-auth.service';
import { CreateHostDto, HostLoginDto } from './dto/host-auth.dto';

@ApiTags('Host Auth')
@Controller('auth/host')
export class HostAuthController {
  constructor(private hostAuth: HostAuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Girls app — host login (admin-created accounts only)' })
  login(@Body() dto: HostLoginDto) {
    return this.hostAuth.login(dto);
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
