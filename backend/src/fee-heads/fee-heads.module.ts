import { Module } from '@nestjs/common';
import { FeeHeadsService } from './fee-heads.service';
import { FeeHeadsController } from './fee-heads.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../common/tenant/tenant.module';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [FeeHeadsController],
  providers: [FeeHeadsService],
  exports: [FeeHeadsService],
})
export class FeeHeadsModule {}
