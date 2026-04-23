/**
 * phone.ts — Vietnamese phone number normalization utility.
 *
 * Supported input formats (all normalize to `0xxxxxxxxx`, 10 digits):
 *   "+84912345678"  → "0912345678"
 *   "84912345678"   → "0912345678"
 *   "0912345678"    → "0912345678"
 *   "0912 345 678"  → "0912345678"
 *   "0912.345.678"  → "0912345678"
 *   "091234567"     → null  (9 digits — too short)
 *   ""              → null  (empty)
 *   "abcdef"        → null  (no digits)
 */

/**
 * Normalize a Vietnamese phone number to standard 10-digit format (0xxxxxxxxx).
 *
 * Returns null when:
 *  - input is empty / whitespace-only
 *  - stripped digit count < 9 (clearly invalid)
 *  - result is not exactly 10 digits starting with 0
 *
 * Examples:
 *  normalizePhone("+84912345678") === "0912345678"
 *  normalizePhone("84912345678")  === "0912345678"
 *  normalizePhone("0912 345 678") === "0912345678"
 *  normalizePhone("091234567")    === null   // only 9 digits
 */
export function normalizePhone(phone: string): string | null {
  if (!phone || !phone.trim()) return null;

  // Strip everything except digits
  const digits = phone.replace(/\D/g, '');

  if (digits.length < 9) return null;

  let normalized: string;

  if (digits.startsWith('84') && digits.length === 11) {
    // 84xxxxxxxxx (11 digits) → 0xxxxxxxxx
    normalized = '0' + digits.slice(2);
  } else if (digits.startsWith('84') && digits.length > 11) {
    // Unexpected long +84 prefix — not a valid VN number
    return null;
  } else {
    normalized = digits;
  }

  // Must be exactly 10 digits starting with 0
  if (normalized.length !== 10 || !normalized.startsWith('0')) return null;

  return normalized;
}
