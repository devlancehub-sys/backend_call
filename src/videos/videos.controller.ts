import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { VideosService } from './videos.service';
import { UnlockVideoDto } from './dto/videos.dto';

@Controller('videos')
@UseGuards(JwtAuthGuard)
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post('unlock')
  unlock(@CurrentUser() user: AuthUser, @Body() dto: UnlockVideoDto) {
    return this.videosService.unlockVideo(user.userId, dto.girlId);
  }

  @Get('access')
  access(
    @CurrentUser() user: AuthUser,
    @Query('girlId', ParseIntPipe) girlId: number,
  ) {
    return this.videosService.getAccess(user.userId, girlId);
  }
}
