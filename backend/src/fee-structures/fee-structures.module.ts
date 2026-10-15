import { Module } from '@nestjs/common';
import { FeeStructuresService } from './fee-structures.service';
import { FeeStructuresController } from './fee-structures.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../common/tenant/tenant.module';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [FeeStructuresController],
  providers: [FeeStructuresService],
  exports: [FeeStructuresService],
})
export class FeeStructuresModule {}
