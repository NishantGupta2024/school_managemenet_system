import { SendWhatsAppOptions, WhatsAppSendResult } from './whatsapp.types';

export abstract class WhatsAppProvider {
  /**
   * Dispatches a WhatsApp message through the underlying provider gateway.
   * Resolves with WhatsAppSendResult if accepted.
   * Rejects with an error (or WhatsAppProviderException) if rejected.
   */
  abstract sendWhatsAppMessage(options: SendWhatsAppOptions): Promise<WhatsAppSendResult>;

  /**
   * Returns human-readable adapter identifier for audit logging.
   */
  abstract getProviderName(): string;

  /**
   * Returns true if this adapter delivers to real external numbers, false if mock.
   */
  abstract isDeliveryProvider(): boolean;
}
