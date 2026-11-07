import { BadRequestException } from '@nestjs/common';
import { GatewayEnvironment } from '@prisma/client';

export interface DecryptedGatewayCredentials {
  provider: any;
  keyId: string;
  keySecret: string;
  webhookSecret: string | null;
  environment: GatewayEnvironment;
  status: any;
}

/**
 * Validates that the Razorpay Key ID matches the configured GatewayEnvironment (TEST vs LIVE),
 * and enforces production environment safeguards (ALLOW_LIVE_PAYMENT_GATEWAY flag).
 *
 * Requirements:
 * - Default: TEST mode.
 * - In TEST mode: Accepts only 'rzp_test_' keys. Rejects 'rzp_live_' keys.
 * - In LIVE mode: Accepts only 'rzp_live_' keys. Rejects 'rzp_test_' keys.
 * - Accidental live mode prevention: LIVE mode requires explicit environment configuration
 *   ALLOW_LIVE_PAYMENT_GATEWAY=true. In test/dev, or if the flag is absent/false, LIVE mode is rejected fail-closed.
 */
export function validateRazorpayKeyEnvironment(
  environment: GatewayEnvironment,
  keyId: string,
): void {
  const isAllowLive = process.env.ALLOW_LIVE_PAYMENT_GATEWAY === 'true';

  if (environment === GatewayEnvironment.LIVE) {
    if (!isAllowLive) {
      throw new BadRequestException(
        'Only Razorpay TEST mode is supported in this phase. LIVE payment gateway mode is not enabled in this environment. To enable live transactions, set ALLOW_LIVE_PAYMENT_GATEWAY=true.',
      );
    }

    if (!keyId.startsWith('rzp_live_')) {
      throw new BadRequestException(
        'Invalid gateway credentials: Key ID must be a Razorpay LIVE key (starting with "rzp_live_") when environment is LIVE.',
      );
    }
  } else if (environment === GatewayEnvironment.TEST) {
    if (!keyId.startsWith('rzp_test_')) {
      throw new BadRequestException(
        'Invalid gateway credentials: Key ID must be a Razorpay TEST key (starting with "rzp_test_") when environment is TEST.',
      );
    }
  } else {
    throw new BadRequestException(
      `Unsupported or invalid gateway environment: '${environment}'. Only TEST and LIVE are supported.`,
    );
  }
}
