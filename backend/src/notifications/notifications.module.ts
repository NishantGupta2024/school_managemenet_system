import { Module } from '@nestjs/common';
import { EmailConfigService } from './email/email-config.service';
import { EmailProvider } from './email/email-provider.interface';
import { MemoryEmailProvider } from './email/memory-email.provider';
import { SmtpEmailProvider } from './email/smtp-email.provider';
import { EmailTemplateRenderer } from './templates/email-template.renderer';
import { NotificationOutboxService } from './outbox/notification-outbox.service';
import { NotificationOutboxWorker } from './worker/notification-outbox.worker';
import { WhatsAppConfigService } from './whatsapp/whatsapp-config.service';
import { WhatsAppProvider } from './whatsapp/whatsapp-provider.interface';
import { MemoryWhatsAppProvider } from './whatsapp/memory-whatsapp.provider';
import { WhatsAppCloudApiProvider } from './whatsapp/whatsapp-cloud-api.provider';
import { FeeReminderService } from './reminders/fee-reminder.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [
    EmailConfigService,
    MemoryEmailProvider,
    SmtpEmailProvider,
    {
      provide: EmailProvider,
      useFactory: (emailConfigService: EmailConfigService, memoryProvider: MemoryEmailProvider, smtpProvider: SmtpEmailProvider) => {
        if (emailConfigService.provider === 'smtp') {
          return smtpProvider;
        }
        return memoryProvider;
      },
      inject: [EmailConfigService, MemoryEmailProvider, SmtpEmailProvider],
    },
    EmailTemplateRenderer,
    NotificationOutboxService,
    NotificationOutboxWorker,
    WhatsAppConfigService,
    MemoryWhatsAppProvider,
    WhatsAppCloudApiProvider,
    {
      provide: WhatsAppProvider,
      useFactory: (whatsappConfigService: WhatsAppConfigService, memoryProvider: MemoryWhatsAppProvider, cloudProvider: WhatsAppCloudApiProvider) => {
        if (whatsappConfigService.provider === 'cloud_api') {
          return cloudProvider;
        }
        return memoryProvider;
      },
      inject: [WhatsAppConfigService, MemoryWhatsAppProvider, WhatsAppCloudApiProvider],
    },
    FeeReminderService,
  ],
  exports: [
    EmailConfigService,
    EmailProvider,
    MemoryEmailProvider,
    SmtpEmailProvider,
    EmailTemplateRenderer,
    NotificationOutboxService,
    NotificationOutboxWorker,
    WhatsAppConfigService,
    WhatsAppProvider,
    MemoryWhatsAppProvider,
    WhatsAppCloudApiProvider,
    FeeReminderService,
  ],
})
export class NotificationsModule {}
