import { Body, Controller, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CallsService } from './calls.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { StartCallDto } from './dto/start-call.dto';
import { EndCallDto } from './dto/end-call.dto';
import { CallTokenDto } from './dto/call-token.dto';

@ApiTags('Call (Zego)')
@ApiBearerAuth('JWT')
@Controller('call')
@UseGuards(JwtAuthGuard)
export class CallController {
  constructor(private readonly callsService: CallsService) {}

  @Post('start')
  @ApiOperation({ summary: 'Start call — male sends host_id, female sends caller_id' })
  start(@Req() req: any, @Body() body: StartCallDto) {
    if (req.user.role === 'male') {
      if (!body.host_id) throw new BadRequestException('host_id is required');
      return this.callsService.initiate(req.user.id, body.host_id, {
        useFreeCall: body.use_free_call,
      });
    }

    if (req.user.role === 'female') {
      if (!body.caller_id) throw new BadRequestException('caller_id is required');
      return this.callsService.initiateFromHost(req.user.id, body.caller_id);
    }

    throw new BadRequestException('Invalid role for starting a call');
  }

  @Post('end')
  @ApiOperation({ summary: 'End call by call_id' })
  end(@Req() req: any, @Body() body: EndCallDto) {
    return this.callsService.end(body.call_id, req.user.id);
  }

  @Post('token')
  @ApiOperation({ summary: 'Generate Zego token for voice call room (alias of join-voice)' })
  token(@Req() req: any, @Body() body: CallTokenDto) {
    return this.callsService.joinVoice(body.call_id, req.user.id);
  }
}
