import { Controller, Get, Post, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CallsService } from './calls.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { InitiateCallDto, InitiateCallerDto } from './dto/calls.dto';

@ApiTags('Calls')
@ApiBearerAuth('JWT')
@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private callsService: CallsService) {}

  @Post('initiate')
  @ApiOperation({ summary: 'Boy calls girl — initiate call' })
  @UseGuards(RolesGuard)
  @Roles('male')
  initiate(@Req() req: any, @Body() body: InitiateCallDto) {
    return this.callsService.initiate(req.user.id, body.host_id);
  }

  @Post('initiate-caller')
  @ApiOperation({ summary: 'Girl calls boy — charge still on boy' })
  @UseGuards(RolesGuard)
  @Roles('female')
  initiateToCaller(@Req() req: any, @Body() body: InitiateCallerDto) {
    return this.callsService.initiateFromHost(req.user.id, body.caller_id);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accept incoming call' })
  @ApiParam({ name: 'id', example: 42 })
  accept(@Req() req: any, @Param('id') id: string) {
    return this.callsService.accept(+id, req.user.id, req.user.role);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject incoming call' })
  @ApiParam({ name: 'id', example: 42 })
  reject(@Req() req: any, @Param('id') id: string) {
    return this.callsService.reject(+id, req.user.id, req.user.role);
  }

  @Post(':id/end')
  @ApiOperation({ summary: 'End active call' })
  @ApiParam({ name: 'id', example: 42 })
  end(@Req() req: any, @Param('id') id: string) {
    return this.callsService.end(+id, req.user.id);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get call history' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  getHistory(@Req() req: any, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.callsService.getHistory(req.user.id, req.user.role, page, limit);
  }
}
