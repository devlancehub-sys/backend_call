import {
  Controller, Get, Post, Delete, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { HostsService } from './hosts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('hosts')
@UseGuards(JwtAuthGuard)
export class HostsController {
  constructor(private hostsService: HostsService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('male')
  browse(@Query() query: any) {
    return this.hostsService.browse(query);
  }

  @Get('online')
  @UseGuards(RolesGuard)
  @Roles('male')
  getOnline() {
    return this.hostsService.getOnline();
  }

  @Get('featured')
  @UseGuards(RolesGuard)
  @Roles('male')
  getFeatured() {
    return this.hostsService.getFeatured();
  }

  @Get('favorites')
  @UseGuards(RolesGuard)
  @Roles('male')
  getFavorites(@Req() req: any) {
    return this.hostsService.getFavorites(req.user.id);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.hostsService.getById(+id);
  }

  @Post(':id/favorite')
  @UseGuards(RolesGuard)
  @Roles('male')
  addFavorite(@Req() req: any, @Param('id') id: string) {
    return this.hostsService.addFavorite(req.user.id, +id);
  }

  @Delete(':id/favorite')
  @UseGuards(RolesGuard)
  @Roles('male')
  removeFavorite(@Req() req: any, @Param('id') id: string) {
    return this.hostsService.removeFavorite(req.user.id, +id);
  }
}
