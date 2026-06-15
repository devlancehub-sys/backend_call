import { Controller, Get, Put, Body, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OnlineStatusDto, UpdateDeviceDto, UpdateLanguagesDto, UpdateProfileDto } from './dto/users.dto';

@ApiTags('Users')
@ApiBearerAuth('JWT')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile with wallet and languages' })
  getProfile(@Req() req: any) {
    return this.usersService.getProfile(req.user.id);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update profile (name, email, age, about, avatar)' })
  updateProfile(@Req() req: any, @Body() body: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.id, body);
  }

  @Put('languages')
  @ApiOperation({ summary: 'Set user spoken languages' })
  updateLanguages(@Req() req: any, @Body() body: UpdateLanguagesDto) {
    return this.usersService.updateLanguages(req.user.id, body.language_ids);
  }

  @Put('online-status')
  @ApiOperation({ summary: 'Set online/offline status' })
  setOnlineStatus(@Req() req: any, @Body() body: OnlineStatusDto) {
    return this.usersService.setOnlineStatus(req.user.id, body.is_online);
  }

  @Put('device')
  @ApiOperation({ summary: 'Update device_id and fcm_token for push notifications' })
  updateDevice(@Req() req: any, @Body() body: UpdateDeviceDto) {
    return this.usersService.updateDevice(req.user.id, body.device_id, body.fcm_token);
  }
}
