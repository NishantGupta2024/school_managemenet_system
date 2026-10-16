import { Module } from '@nestjs/common';
import { EmailConfigService } from './email/email-config.service';
import { EmailProvider } from './email/email-provider.interface';
import { MemoryEmailProvider } from './email/memory-email.provider';
import { EmailTemplateRenderer } from './templates/email-template.renderer';
import { NotificationOutboxService } from './outbox/notification-outbox.service';
import { NotificationOutboxWorker } from './worker/notification-outbox.worker';

@Module({
  providers: [
    EmailConfigService,
    MemoryEmailProvider,
    {
      provide: EmailProvider,
      useExisting: MemoryEmailProvider,
    },
    EmailTemplateRenderer,
    NotificationOutboxService,
    NotificationOutboxWorker,
  ],
  exports: [
    EmailConfigService,
    EmailProvider,
    MemoryEmailProvider,
    EmailTemplateRenderer,
    NotificationOutboxService,
    NotificationOutboxWorker,
  ],
})
export class NotificationsModule {}
