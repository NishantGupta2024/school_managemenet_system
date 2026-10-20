import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportConfigService } from './report-config.service';
import { ReportsExportService } from './reports-export.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../common/tenant/tenant.module';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportConfigService, ReportsExportService],
  exports: [ReportsService, ReportConfigService, ReportsExportService],
})
export class ReportsModule {}
