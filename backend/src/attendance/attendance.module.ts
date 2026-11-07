import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { ATTENDANCE_REPOSITORY } from './attendance.repository.interface';
import { AttendancePrismaRepository } from './attendance.repository';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    {
      provide: ATTENDANCE_REPOSITORY,
      useClass: AttendancePrismaRepository,
    },
  ],
  exports: [AttendanceService],
})
export class AttendanceModule {}
