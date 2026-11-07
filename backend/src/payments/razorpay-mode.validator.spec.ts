import { BadRequestException } from '@nestjs/common';
import { GatewayEnvironment } from '@prisma/client';
import { validateRazorpayKeyEnvironment } from './razorpay-mode.validator';

describe('validateRazorpayKeyEnvironment (P0-1 Mode Separation)', () => {
  const originalEnv = process.env.ALLOW_LIVE_PAYMENT_GATEWAY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ALLOW_LIVE_PAYMENT_GATEWAY = originalEnv;
    } else {
      delete process.env.ALLOW_LIVE_PAYMENT_GATEWAY;
    }
  });

  describe('1. TEST Mode Behavior (Default Safe Mode)', () => {
    it('accepts valid Razorpay test keys starting with rzp_test_', () => {
      delete process.env.ALLOW_LIVE_PAYMENT_GATEWAY;
      expect(() => {
        validateRazorpayKeyEnvironment(
          GatewayEnvironment.TEST,
          'rzp_test_12345abcdef',
        );
      }).not.toThrow();
    });

    it('rejects live keys (rzp_live_) in TEST mode with BadRequestException', () => {
      delete process.env.ALLOW_LIVE_PAYMENT_GATEWAY;
      expect(() => {
        validateRazorpayKeyEnvironment(
          GatewayEnvironment.TEST,
          'rzp_live_12345abcdef',
        );
      }).toThrow(BadRequestException);
      expect(() => {
        validateRazorpayKeyEnvironment(
          GatewayEnvironment.TEST,
          'rzp_live_12345abcdef',
        );
      }).toThrow(/must be a Razorpay TEST key/i);
    });

    it('rejects malformed keys that do not start with rzp_test_ in TEST mode', () => {
      expect(() => {
        validateRazorpayKeyEnvironment(
          GatewayEnvironment.TEST,
          'invalid_key_prefix',
        );
      }).toThrow(BadRequestException);
    });
  });

  describe('2. LIVE Mode Behavior & Environment Flag Requirement', () => {
    it('fails closed and rejects LIVE mode when ALLOW_LIVE_PAYMENT_GATEWAY is unset (default)', () => {
      delete process.env.ALLOW_LIVE_PAYMENT_GATEWAY;
      expect(() => {
        validateRazorpayKeyEnvironment(
          GatewayEnvironment.LIVE,
          'rzp_live_12345abcdef',
        );
      }).toThrow(BadRequestException);
      expect(() => {
        validateRazorpayKeyEnvironment(
          GatewayEnvironment.LIVE,
          'rzp_live_12345abcdef',
        );
      }).toThrow(/LIVE payment gateway mode is not enabled in this environment/i);
    });

    it('fails closed and rejects LIVE mode when ALLOW_LIVE_PAYMENT_GATEWAY is set to false', () => {
      process.env.ALLOW_LIVE_PAYMENT_GATEWAY = 'false';
      expect(() => {
        validateRazorpayKeyEnvironment(
          GatewayEnvironment.LIVE,
          'rzp_live_12345abcdef',
        );
      }).toThrow(BadRequestException);
    });

    it('accepts valid Razorpay live keys starting with rzp_live_ when ALLOW_LIVE_PAYMENT_GATEWAY is true', () => {
      process.env.ALLOW_LIVE_PAYMENT_GATEWAY = 'true';
      expect(() => {
        validateRazorpayKeyEnvironment(
          GatewayEnvironment.LIVE,
          'rzp_live_12345abcdef',
        );
      }).not.toThrow();
    });

    it('rejects test keys (rzp_test_) in LIVE mode even when ALLOW_LIVE_PAYMENT_GATEWAY is true', () => {
      process.env.ALLOW_LIVE_PAYMENT_GATEWAY = 'true';
      expect(() => {
        validateRazorpayKeyEnvironment(
          GatewayEnvironment.LIVE,
          'rzp_test_12345abcdef',
        );
      }).toThrow(BadRequestException);
      expect(() => {
        validateRazorpayKeyEnvironment(
          GatewayEnvironment.LIVE,
          'rzp_test_12345abcdef',
        );
      }).toThrow(/must be a Razorpay LIVE key/i);
    });

    it('rejects malformed keys that do not start with rzp_live_ in LIVE mode', () => {
      process.env.ALLOW_LIVE_PAYMENT_GATEWAY = 'true';
      expect(() => {
        validateRazorpayKeyEnvironment(
          GatewayEnvironment.LIVE,
          'invalid_live_key',
        );
      }).toThrow(BadRequestException);
    });
  });

  describe('3. Invalid / Ambiguous Environment Handling', () => {
    it('rejects unknown environment values fail-closed', () => {
      expect(() => {
        validateRazorpayKeyEnvironment(
          'UNKNOWN_ENV' as any,
          'rzp_test_12345abcdef',
        );
      }).toThrow(BadRequestException);
    });
  });
});
