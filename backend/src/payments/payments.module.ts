import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../common/tenant/tenant.module';
import { FeeGenerationModule } from '../fee-generation/fee-generation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SchoolsModule } from '../schools/schools.module';
import { ReceiptTemplatesModule } from '../receipt-templates/receipt-templates.module';
import { ReceiptSequenceService } from './receipt-sequence.service';
import { ReversalSequenceService } from './reversal-sequence.service';
import { ReceiptNumberingService } from './receipt-numbering.service';
import { PaymentsService } from './payments.service';
import { OnlinePaymentsService } from './online-payments.service';
import { RazorpayWebhookService } from './razorpay-webhook.service';
import { PaymentsController } from './payments.controller';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { ReceiptNumberingController } from './receipt-numbering.controller';

@Module({
  imports: [
    PrismaModule,
    TenantModule,
    FeeGenerationModule,
    NotificationsModule,
    SchoolsModule,
    ReceiptTemplatesModule,
  ],
  controllers: [PaymentsController, RazorpayWebhookController, ReceiptNumberingController],
  providers: [
    PaymentsService,
    OnlinePaymentsService,
    RazorpayWebhookService,
    ReceiptSequenceService,
    ReversalSequenceService,
    ReceiptNumberingService,
  ],
  exports: [
    PaymentsService,
    OnlinePaymentsService,
    RazorpayWebhookService,
    ReceiptSequenceService,
    ReversalSequenceService,
    ReceiptNumberingService,
  ],
})
export class PaymentsModule {}
