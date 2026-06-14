import { Controller, Get, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { UpdateSettingsDto } from './dto/admin.dto';

@ApiTags('Admin')
@ApiSecurity('admin-key')
@Controller('admin')
@UseGuards(AdminApiKeyGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard stats' })
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('users')
  @ApiOperation({ summary: 'List users' })
  @ApiQuery({ name: 'role', required: false, example: 'male' })
  getUsers(@Query('role') role?: string) {
    return this.adminService.getUsers(role);
  }

  @Get('hosts')
  @ApiOperation({ summary: 'List female hosts' })
  getHosts() {
    return this.adminService.getHosts();
  }

  @Get('calls')
  @ApiOperation({ summary: 'List all calls' })
  getCalls() {
    return this.adminService.getCalls();
  }

  @Get('withdrawals')
  @ApiOperation({ summary: 'List pending withdrawals' })
  getWithdrawals() {
    return this.adminService.getWithdrawals();
  }

  @Put('withdrawals/:id/complete')
  @ApiOperation({ summary: 'Mark withdrawal as completed' })
  @ApiParam({ name: 'id', example: 5 })
  completeWithdrawal(@Param('id') id: string) {
    return this.adminService.completeWithdrawal(+id);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get platform settings' })
  getSettings() {
    return this.adminService.getSettings();
  }

  @Put('settings')
  @ApiOperation({ summary: 'Update platform settings' })
  updateSettings(@Body() body: UpdateSettingsDto) {
    return this.adminService.updateSettings(body.settings);
  }
}
