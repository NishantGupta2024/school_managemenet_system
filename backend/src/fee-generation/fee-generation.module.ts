import { Module } from '@nestjs/common';
import { FeeGenerationService } from './fee-generation.service';
import { FeeGenerationController } from './fee-generation.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../common/tenant/tenant.module';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [FeeGenerationController],
  providers: [FeeGenerationService],
  exports: [FeeGenerationService],
})
export class FeeGenerationModule {}
