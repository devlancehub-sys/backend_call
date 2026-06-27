import { Controller, Get, Put, Post, Body, Param, Query, UseGuards, HttpCode } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { UpdateSettingsDto, UpdateUserStatusDto } from './dto/admin.dto';

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

  @Get('leaderboard')
  @ApiOperation({ summary: 'Weekly creator leaderboard by talk time' })
  getLeaderboard(@Query('limit') limit?: string) {
    return this.adminService.getWeeklyLeaderboard(limit ? +limit : 50);
  }

  @Put('hosts/:id/promote')
  @ApiOperation({ summary: 'Promote or demote a creator (60% earnings when promoted)' })
  @ApiParam({ name: 'id', example: 12 })
  promoteHost(@Param('id') id: string, @Body() body: { is_featured: boolean }) {
    return this.adminService.setHostPromoted(+id, !!body.is_featured);
  }

  @Post('leaderboard/promote-top')
  @HttpCode(200)
  @ApiOperation({ summary: 'Promote top weekly creators from leaderboard' })
  promoteTopCreators(@Body() body: { limit?: number }) {
    return this.adminService.promoteTopCreators(body?.limit ?? 10);
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

  @Put('users/:id/status')
  @ApiOperation({ summary: 'Set user status — inactive | active | disabled' })
  @ApiParam({ name: 'id', example: 12 })
  updateUserStatus(@Param('id') id: string, @Body() body: UpdateUserStatusDto) {
    return this.adminService.updateUserStatus(+id, body.status);
  }

  @Post('data/purge-users')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete all user data — keeps admin accounts, languages, and platform settings',
  })
  purgeUserData() {
    return this.adminService.purgeAllUserData();
  }

  @Post('data/clear-calls-sessions')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete all calls and disconnect all socket sessions' })
  clearCallsAndSessions() {
    return this.adminService.clearAllCallsAndSessions();
  }
}
