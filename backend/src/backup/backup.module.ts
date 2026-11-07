import { Module } from '@nestjs/common';
import { DatabaseBackupService } from './database-backup.service';
import { DatabaseBackupScheduler } from './database-backup.scheduler';
import { BackupExecutionLogService } from './backup-execution-log.service';
import { BackupAlertService } from './backup-alert.service';
import { BackupRetentionService } from './backup-retention.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [
    DatabaseBackupService,
    DatabaseBackupScheduler,
    BackupExecutionLogService,
    BackupAlertService,
    BackupRetentionService,
  ],
  exports: [
    DatabaseBackupService,
    DatabaseBackupScheduler,
    BackupExecutionLogService,
    BackupAlertService,
    BackupRetentionService,
  ],
})
export class BackupModule {}
