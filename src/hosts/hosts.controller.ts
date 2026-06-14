import {
  Controller, Get, Post, Delete, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { HostsService } from './hosts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Hosts')
@ApiBearerAuth('JWT')
@Controller('hosts')
@UseGuards(JwtAuthGuard)
export class HostsController {
  constructor(private hostsService: HostsService) {}

  @Get()
  @ApiOperation({ summary: 'Browse hosts with filters (boys only)' })
  @ApiQuery({ name: 'language_id', required: false, example: 1 })
  @ApiQuery({ name: 'search', required: false, example: 'Priya' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @UseGuards(RolesGuard)
  @Roles('male')
  browse(@Query() query: any) {
    return this.hostsService.browse(query);
  }

  @Get('online')
  @ApiOperation({ summary: 'List online hosts (boys only)' })
  @UseGuards(RolesGuard)
  @Roles('male')
  getOnline() {
    return this.hostsService.getOnline();
  }

  @Get('featured')
  @ApiOperation({ summary: 'List featured hosts (boys only)' })
  @UseGuards(RolesGuard)
  @Roles('male')
  getFeatured() {
    return this.hostsService.getFeatured();
  }

  @Get('favorites')
  @ApiOperation({ summary: 'List favorite hosts (boys only)' })
  @UseGuards(RolesGuard)
  @Roles('male')
  getFavorites(@Req() req: any) {
    return this.hostsService.getFavorites(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get host profile by id' })
  @ApiParam({ name: 'id', example: 12 })
  getById(@Param('id') id: string) {
    return this.hostsService.getById(+id);
  }

  @Post(':id/favorite')
  @ApiOperation({ summary: 'Add host to favorites (boys only)' })
  @ApiParam({ name: 'id', example: 12 })
  @UseGuards(RolesGuard)
  @Roles('male')
  addFavorite(@Req() req: any, @Param('id') id: string) {
    return this.hostsService.addFavorite(req.user.id, +id);
  }

  @Delete(':id/favorite')
  @ApiOperation({ summary: 'Remove host from favorites (boys only)' })
  @ApiParam({ name: 'id', example: 12 })
  @UseGuards(RolesGuard)
  @Roles('male')
  removeFavorite(@Req() req: any, @Param('id') id: string) {
    return this.hostsService.removeFavorite(req.user.id, +id);
  }
}
