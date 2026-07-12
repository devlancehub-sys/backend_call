import { Controller, Post, Delete, Get, Param, Body, UseGuards } from '@nestjs/common';
import { FollowsService } from './follows.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('follows')
@UseGuards(JwtAuthGuard)
export class FollowsController {
  constructor(private followsService: FollowsService) {}

  @Post(':followingId')
  async follow(
    @CurrentUser('id') followerId: number,
    @Param('followingId') followingId: number,
  ) {
    return this.followsService.follow(followerId, Number(followingId));
  }

  @Delete(':followingId')
  async unfollow(
    @CurrentUser('id') followerId: number,
    @Param('followingId') followingId: number,
  ) {
    return this.followsService.unfollow(followerId, Number(followingId));
  }

  @Get('followers/:hostId')
  async getFollowers(@Param('hostId') hostId: number) {
    return this.followsService.getFollowers(Number(hostId));
  }

  @Get('following')
  async getFollowing(@CurrentUser('id') userId: number) {
    return this.followsService.getFollowing(userId);
  }
}
