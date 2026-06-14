import { Controller, Get, UseGuards } from '@nestjs/common';
import { CallersService } from './callers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('callers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('female')
export class CallersController {
  constructor(private callersService: CallersService) {}

  @Get()
  browse() {
    return this.callersService.browse();
  }

  @Get('online')
  getOnline() {
    return this.callersService.getOnline();
  }
}
