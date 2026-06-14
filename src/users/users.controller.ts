import { Controller, Get, Put, Body, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('profile')
  getProfile(@Req() req: any) {
    return this.usersService.getProfile(req.user.id);
  }

  @Put('profile')
  updateProfile(@Req() req: any, @Body() body: any) {
    return this.usersService.updateProfile(req.user.id, body);
  }

  @Put('languages')
  updateLanguages(@Req() req: any, @Body('language_ids') languageIds: number[]) {
    return this.usersService.updateLanguages(req.user.id, languageIds);
  }

  @Put('online-status')
  setOnlineStatus(@Req() req: any, @Body('is_online') isOnline: boolean) {
    return this.usersService.setOnlineStatus(req.user.id, isOnline);
  }
}
