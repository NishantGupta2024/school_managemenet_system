import { Module } from '@nestjs/common';
import { ExcelImportsService } from './excel-imports.service';
import { ExcelImportsController } from './excel-imports.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../common/tenant/tenant.module';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [ExcelImportsController],
  providers: [ExcelImportsService],
  exports: [ExcelImportsService],
})
export class ExcelImportsModule {}
