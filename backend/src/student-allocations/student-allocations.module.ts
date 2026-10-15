import { Module } from '@nestjs/common';
import { StudentAllocationsService } from './student-allocations.service';
import { StudentAllocationsController } from './student-allocations.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../common/tenant/tenant.module';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [StudentAllocationsController],
  providers: [StudentAllocationsService],
  exports: [StudentAllocationsService],
})
export class StudentAllocationsModule {}
