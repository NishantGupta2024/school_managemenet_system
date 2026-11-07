import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { NotificationsAdminService } from './notifications-admin.service';
import { UpdateSchoolNotificationSettingDto } from './dto/update-school-notification-setting.dto';
import { QueryNotificationLogsDto } from './dto/query-notification-logs.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(UserRole.SCHOOL_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
export class NotificationsController {
  constructor(private readonly notificationsAdminService: NotificationsAdminService) {}

  @Get('settings')
  async getSettings(@Req() req: any) {
    const schoolId = req.school.id;
    return this.notificationsAdminService.getSettings(schoolId);
  }

  @Patch('settings')
  @HttpCode(HttpStatus.OK)
  async updateSettings(
    @Req() req: any,
    @Body() dto: UpdateSchoolNotificationSettingDto,
  ) {
    const schoolId = req.school.id;
    return this.notificationsAdminService.updateSettings(schoolId, dto);
  }

  @Get('logs')
  async getLogs(
    @Req() req: any,
    @Query() query: QueryNotificationLogsDto,
  ) {
    const schoolId = req.school.id;
    return this.notificationsAdminService.findLogs(schoolId, query);
  }

  @Get('logs/:id')
  async getLogById(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const schoolId = req.school.id;
    return this.notificationsAdminService.findLogById(schoolId, id);
  }
}
