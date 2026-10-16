/**
 * Safely escapes HTML special characters to prevent Cross-Site Scripting (XSS).
 */
export function escapeHtml(unsafe: any): string {
  if (unsafe === null || unsafe === undefined) {
    return '';
  }
  const str = String(unsafe);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Validates whether an email string conforms to standard format.
 */
export function validateEmailAddress(email?: string | null): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(email.trim());
}

/**
 * Sanitizes sender display names to strictly prevent email header injection attacks
 * (strips CRLF, non-printable control characters, and limits length to 100 chars).
 */
export function sanitizeSenderDisplayName(name?: string | null): string {
  if (!name) {
    return 'School Fee System';
  }
  // Strip carriage returns, newlines, null bytes, and non-printable characters
  const clean = name
    .replace(/[\r\n\t\0]/g, ' ')
    .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '')
    .trim();

  // Limit to 100 characters
  return clean.slice(0, 100) || 'School Fee System';
}

/**
 * Sanitizes free-form reason text for parent communications.
 * Strips control characters, caps length to prevent accidental internal note leakage.
 */
export function sanitizeReasonText(reason?: string | null, maxLength = 250): string {
  if (!reason) {
    return 'Administrative adjustment';
  }
  const clean = String(reason)
    .replace(/[\r\n\t\0]/g, ' ')
    .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '')
    .trim();

  if (clean.length > maxLength) {
    return clean.slice(0, maxLength) + '...';
  }
  return clean || 'Administrative adjustment';
}

/**
 * Sanitizes plain text content by removing harmful non-printable control characters.
 */
export function sanitizePlainText(text: any): string {
  if (text === null || text === undefined) {
    return '';
  }
  return String(text)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}

/**
 * Masks sensitive account numbers if passed in reference fields (e.g., if a 12+ digit
 * bank account is passed instead of a UTR, mask all but the last 4 digits).
 */
export function maskSensitiveReference(ref?: string | null): string {
  if (!ref) {
    return 'N/A';
  }
  const trimmed = String(ref).trim();
  // If pure digits and length >= 8, treat as possible bank account number and mask
  if (/^\d{8,}$/.test(trimmed)) {
    return '••••••••' + trimmed.slice(-4);
  }
  return trimmed;
}

/**
 * Formats a monetary amount into a standard 2-decimal string.
 */
export function formatAmount(amount: number | string, currency = 'INR'): string {
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount));
  if (isNaN(num)) {
    return '0.00';
  }
  return `${currency} ${num.toFixed(2)}`;
}
