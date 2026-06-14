import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CallersService } from './callers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Callers')
@ApiBearerAuth('JWT')
@Controller('callers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('female')
export class CallersController {
  constructor(private callersService: CallersService) {}

  @Get()
  @ApiOperation({ summary: 'Browse callers (boys) — girls only' })
  browse() {
    return this.callersService.browse();
  }

  @Get('online')
  @ApiOperation({ summary: 'List online callers — girls only' })
  getOnline() {
    return this.callersService.getOnline();
  }
}
