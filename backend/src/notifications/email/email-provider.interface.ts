import { EmailSendResult, SendEmailOptions } from './email.types';

export abstract class EmailProvider {
  /**
   * Dispatches an email through the underlying provider gateway.
   * Resolves with EmailSendResult if provider accepted the message.
   * Rejects with an error (or EmailProviderException) if rejected.
   */
  abstract sendEmail(options: SendEmailOptions): Promise<EmailSendResult>;

  /**
   * Returns human-readable adapter identifier for audit logging.
   */
  abstract getProviderName(): string;

  /**
   * Returns true if this adapter delivers to external mailboxes, false if it's an in-memory/test mock.
   */
  abstract isDeliveryProvider(): boolean;
}
