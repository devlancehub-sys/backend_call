import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminJwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { AdminService } from './admin.service';
import { UPLOAD_LIMITS } from './upload.config';
import {
  AdminLoginDto,
  CreateCreatorDto,
  CreditWalletDto,
  UpdateCreatorDto,
} from './dto/admin.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('login')
  login(@Body() dto: AdminLoginDto) {
    return this.adminService.login(dto);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('dashboard')
  dashboard() {
    return this.adminService.getDashboard();
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('creators')
  listCreators(@Query() query: PaginationQueryDto) {
    return this.adminService.listCreators(query.page ?? 1, query.limit ?? 20);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('creators')
  createCreator(@Body() dto: CreateCreatorDto) {
    return this.adminService.createCreator(dto);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Put('creators/:id')
  updateCreator(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCreatorDto,
  ) {
    return this.adminService.updateCreator(id, dto);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Delete('creators/:id')
  deleteCreator(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteCreator(id);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('storage/status')
  storageStatus() {
    return this.adminService.getStorageStatus();
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('creators/:id/photo')
  @UseInterceptors(FileInterceptor('file', { limits: UPLOAD_LIMITS.photo }))
  uploadPhoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.adminService.uploadPhoto(id, file);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('creators/:id/video')
  @UseInterceptors(FileInterceptor('file', { limits: UPLOAD_LIMITS.video }))
  uploadVideo(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.adminService.uploadVideo(id, file);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('creators/:id/thumbnail')
  @UseInterceptors(FileInterceptor('file', { limits: UPLOAD_LIMITS.thumbnail }))
  uploadThumbnail(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.adminService.uploadThumbnail(id, file);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('videos')
  listVideos(@Query() query: PaginationQueryDto) {
    return this.adminService.listVideos(query.page ?? 1, query.limit ?? 20);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('users')
  listUsers(@Query() query: PaginationQueryDto) {
    return this.adminService.listUsers(query.page ?? 1, query.limit ?? 20);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('users/:id/wallet/credit')
  creditUserWallet(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreditWalletDto,
  ) {
    return this.adminService.creditUserWallet(
      id,
      dto.amount,
      dto.description,
    );
  }

  @UseGuards(AdminJwtAuthGuard)
  @Delete('users/:id')
  deleteUser(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteUser(id);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('wallet/transactions')
  walletTransactions(@Query() query: PaginationQueryDto) {
    return this.adminService.listWalletTransactions(
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('recharges')
  recharges(@Query() query: PaginationQueryDto) {
    return this.adminService.listRecharges(query.page ?? 1, query.limit ?? 20);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('purchases')
  purchases(@Query() query: PaginationQueryDto) {
    return this.adminService.listPurchases(query.page ?? 1, query.limit ?? 20);
  }
}
