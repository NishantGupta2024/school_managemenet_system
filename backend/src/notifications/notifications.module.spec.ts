import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsModule } from './notifications.module';
import { PrismaService } from '../prisma/prisma.service';
import { SmtpEmailProvider } from './email/smtp-email.provider';
import { WhatsAppCloudApiProvider } from './whatsapp/whatsapp-cloud-api.provider';
import { EmailProvider } from './email/email-provider.interface';
import { WhatsAppProvider } from './whatsapp/whatsapp-provider.interface';
import { NotificationOutboxWorker } from './worker/notification-outbox.worker';
import { FeeReminderService } from './reminders/fee-reminder.service';

describe('NotificationsModule DI Verification', () => {
  let module: TestingModule;

  beforeAll(async () => {
    const mockPrismaService = {
      schoolNotificationSetting: { findUnique: jest.fn() },
      notificationOutbox: { findMany: jest.fn(), updateMany: jest.fn() },
      notificationDeliveryAttempt: { create: jest.fn() },
      feeInvoice: { findMany: jest.fn() },
      school: { findUnique: jest.fn() },
    };

    module = await Test.createTestingModule({
      imports: [NotificationsModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();
  });

  it('should compile NotificationsModule without UnknownDependenciesException', () => {
    expect(module).toBeDefined();
  });

  it('should successfully resolve SmtpEmailProvider with optional sessionFactory', () => {
    const smtpProvider = module.get<SmtpEmailProvider>(SmtpEmailProvider);
    expect(smtpProvider).toBeDefined();
    expect(smtpProvider.getProviderName()).toBe('SMTP_DELIVERY_PROVIDER');
  });

  it('should successfully resolve WhatsAppCloudApiProvider with optional httpDispatcher', () => {
    const cloudApiProvider = module.get<WhatsAppCloudApiProvider>(WhatsAppCloudApiProvider);
    expect(cloudApiProvider).toBeDefined();
    expect(cloudApiProvider.getProviderName()).toBe('META_WHATSAPP_CLOUD_API');
  });

  it('should resolve all exported notification services and workers', () => {
    expect(module.get(EmailProvider)).toBeDefined();
    expect(module.get(WhatsAppProvider)).toBeDefined();
    expect(module.get(NotificationOutboxWorker)).toBeDefined();
    expect(module.get(FeeReminderService)).toBeDefined();
  });
});
