import { Controller, Get, Post, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { CallsService } from './calls.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private callsService: CallsService) {}

  /** Boy calls girl */
  @Post('initiate')
  @UseGuards(RolesGuard)
  @Roles('male')
  initiate(@Req() req: any, @Body('host_id') hostId: number) {
    return this.callsService.initiate(req.user.id, hostId);
  }

  /** Girl calls boy — charge still on boy */
  @Post('initiate-caller')
  @UseGuards(RolesGuard)
  @Roles('female')
  initiateToCaller(@Req() req: any, @Body('caller_id') callerId: number) {
    return this.callsService.initiateFromHost(req.user.id, callerId);
  }

  @Post(':id/accept')
  accept(@Req() req: any, @Param('id') id: string) {
    return this.callsService.accept(+id, req.user.id, req.user.role);
  }

  @Post(':id/reject')
  reject(@Req() req: any, @Param('id') id: string) {
    return this.callsService.reject(+id, req.user.id, req.user.role);
  }

  @Post(':id/end')
  end(@Req() req: any, @Param('id') id: string) {
    return this.callsService.end(+id, req.user.id);
  }

  @Get('history')
  getHistory(@Req() req: any, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.callsService.getHistory(req.user.id, req.user.role, page, limit);
  }
}
