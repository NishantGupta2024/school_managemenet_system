import { Module } from '@nestjs/common';
import { FeeGenerationService } from './fee-generation.service';
import { FeeGenerationController } from './fee-generation.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../common/tenant/tenant.module';
import { FineRulesModule } from '../fine-rules/fine-rules.module';

@Module({
  imports: [PrismaModule, TenantModule, FineRulesModule],
  controllers: [FeeGenerationController],
  providers: [FeeGenerationService],
  exports: [FeeGenerationService],
})
export class FeeGenerationModule {}

