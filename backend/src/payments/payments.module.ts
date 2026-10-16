import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../common/tenant/tenant.module';
import { FeeGenerationModule } from '../fee-generation/fee-generation.module';
import { ReceiptSequenceService } from './receipt-sequence.service';
import { ReversalSequenceService } from './reversal-sequence.service';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [PrismaModule, TenantModule, FeeGenerationModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, ReceiptSequenceService, ReversalSequenceService],
  exports: [PaymentsService, ReceiptSequenceService, ReversalSequenceService],
})
export class PaymentsModule {}

