const INSECURE_PLACEHOLDER_SECRETS = new Set([
  'super-secret-key-for-development-phase1-school-fee-mgmt',
  'replace_with_cryptographically_strong_64_char_secret_in_production',
  'your-super-secret-jwt-key-change-in-production',
  'secret',
  'jwt_secret',
  'jwt-secret',
  'changeme',
  'password',
  '123456',
  'default',
  'test',
]);

const NON_PROD_FALLBACK_SECRET =
  'dev-test-only-fallback-jwt-secret-not-for-production-use-32chars';

export const MIN_PRODUCTION_JWT_SECRET_LENGTH = 32;

/**
 * Resolves and validates the JWT signing secret.
 * - In production (`NODE_ENV === 'production'`), fails closed immediately if `JWT_SECRET`
 *   is missing, shorter than 32 characters, or matches a known default/placeholder secret.
 * - In non-production (`development` / `test`), uses `JWT_SECRET` when provided or falls
 *   back to a non-production test secret so unit/E2E suites can run isolated from host env.
 */
export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const isProduction = (env.NODE_ENV || '').trim().toLowerCase() === 'production';
  const rawSecret = env.JWT_SECRET?.trim();

  if (isProduction) {
    if (!rawSecret) {
      throw new Error(
        'CRITICAL SECURITY CONFIGURATION ERROR: JWT_SECRET environment variable is required in production.',
      );
    }

    if (
      rawSecret.length < MIN_PRODUCTION_JWT_SECRET_LENGTH ||
      INSECURE_PLACEHOLDER_SECRETS.has(rawSecret.toLowerCase())
    ) {
      throw new Error(
        `CRITICAL SECURITY CONFIGURATION ERROR: JWT_SECRET is too weak or uses a known default placeholder. A cryptographically strong secret of at least ${MIN_PRODUCTION_JWT_SECRET_LENGTH} characters is required in production.`,
      );
    }

    return rawSecret;
  }

  if (rawSecret && rawSecret.length > 0) {
    return rawSecret;
  }

  return NON_PROD_FALLBACK_SECRET;
}
