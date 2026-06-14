import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { HostAuthService } from './host-auth.service';
import { CreateHostDto, HostLoginDto } from './dto/host-auth.dto';

@Controller('auth/host')
export class HostAuthController {
  constructor(private hostAuth: HostAuthService) {}

  /** Girl logs in — account must be created by admin first */
  @Post('login')
  login(@Body() dto: HostLoginDto) {
    return this.hostAuth.login(dto);
  }
}

@Controller('admin/hosts')
@UseGuards(AdminApiKeyGuard)
export class AdminHostsController {
  constructor(private hostAuth: HostAuthService) {}

  /** Admin creates host username + password */
  @Post()
  createHost(@Body() dto: CreateHostDto) {
    return this.hostAuth.createHost(dto);
  }
}
