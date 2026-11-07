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
import { FeeReminderScheduler } from './reminders/fee-reminder.scheduler';
import { NotificationsAdminService } from './notifications-admin.service';
import { NotificationsController } from './notifications.controller';
import { MailtrapRateLimiter } from './email/mailtrap-rate-limiter';
import { RedisRateLimiterClient } from './email/redis-rate-limiter.client';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [
    EmailConfigService,
    {
      provide: RedisRateLimiterClient,
      useFactory: () => new RedisRateLimiterClient(process.env.REDIS_URL),
    },
    {
      provide: MailtrapRateLimiter,
      useFactory: (redisClient: RedisRateLimiterClient) => {
        if (redisClient.isConfigured()) {
          return new MailtrapRateLimiter({
            mode: 'distributed',
            redisClient,
          });
        }
        return new MailtrapRateLimiter({ mode: 'in-memory' });
      },
      inject: [RedisRateLimiterClient],
    },
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
    FeeReminderScheduler,
    NotificationsAdminService,
  ],
  exports: [
    EmailConfigService,
    RedisRateLimiterClient,
    MailtrapRateLimiter,
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
    NotificationsAdminService,
  ],
})
export class NotificationsModule {}
