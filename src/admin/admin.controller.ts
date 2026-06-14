import { Controller, Get, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';

@Controller('admin')
@UseGuards(AdminApiKeyGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('users')
  getUsers(@Query('role') role?: string) {
    return this.adminService.getUsers(role);
  }

  @Get('hosts')
  getHosts() {
    return this.adminService.getHosts();
  }

  @Get('calls')
  getCalls() {
    return this.adminService.getCalls();
  }

  @Get('withdrawals')
  getWithdrawals() {
    return this.adminService.getWithdrawals();
  }

  @Put('withdrawals/:id/complete')
  completeWithdrawal(@Param('id') id: string) {
    return this.adminService.completeWithdrawal(+id);
  }

  @Get('settings')
  getSettings() {
    return this.adminService.getSettings();
  }

  @Put('settings')
  updateSettings(@Body('settings') settings: Record<string, string>) {
    return this.adminService.updateSettings(settings);
  }
}
