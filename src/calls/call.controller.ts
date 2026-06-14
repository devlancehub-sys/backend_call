import { Body, Controller, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { CallsService } from './calls.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StartCallDto } from './dto/start-call.dto';
import { EndCallDto } from './dto/end-call.dto';
import { CallTokenDto } from './dto/call-token.dto';

/** ZEGOCLOUD voice call APIs (production endpoints). */
@Controller('call')
@UseGuards(JwtAuthGuard)
export class CallController {
  constructor(private readonly callsService: CallsService) {}

  @Post('start')
  start(@Req() req: any, @Body() body: StartCallDto) {
    if (req.user.role === 'male') {
      if (!body.host_id) throw new BadRequestException('host_id is required');
      return this.callsService.initiate(req.user.id, body.host_id);
    }

    if (req.user.role === 'female') {
      if (!body.caller_id) throw new BadRequestException('caller_id is required');
      return this.callsService.initiateFromHost(req.user.id, body.caller_id);
    }

    throw new BadRequestException('Invalid role for starting a call');
  }

  @Post('end')
  end(@Req() req: any, @Body() body: EndCallDto) {
    return this.callsService.end(body.call_id, req.user.id);
  }

  @Post('token')
  token(@Req() req: any, @Body() body: CallTokenDto) {
    return this.callsService.generateCallToken(body.call_id, req.user.id);
  }
}
