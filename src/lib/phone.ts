// Phone helpers shared by the contact form, Site Settings and the admin inbox.
// Storage format: optional leading "+" followed by 6–15 digits (matches the DB check).

/** Strips spaces, dashes, dots and brackets; keeps a single leading "+". */
export function normalizePhone(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/[^0-9]/g, '');
}

export const PHONE_PATTERN = /^\+?[0-9]{6,15}$/;

/** True when the value contains only phone characters and 6–15 digits. */
export function isValidPhone(value: string): boolean {
  if (!/^\+?[0-9\s().-]+$/.test(value.trim())) return false;
  return PHONE_PATTERN.test(normalizePhone(value));
}

// Country calling codes that are 1 or 2 digits long (ITU E.164). Everything else is 3 digits.
const ONE_DIGIT = new Set(['1', '7']);
const TWO_DIGIT = new Set([
  '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49',
  '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84',
  '86', '90', '91', '92', '93', '94', '95', '98',
]);

/**
 * Length-based grouping that reads naturally for most national formats:
 * 8 → 2·3·3 (61 234 567), 9 → 3·3·3 (061 234 567), 10 → 3·3·4 (415 555 0132).
 */
function group(digits: string): string {
  const n = digits.length;
  if (n <= 4) return digits;
  const sizes: number[] = [];
  if (n % 3 === 2) sizes.push(2);
  let remaining = n - sizes.reduce((a, b) => a + b, 0);
  while (remaining > 0) {
    const size = remaining === 4 ? 4 : 3;
    sizes.push(size);
    remaining -= size;
  }
  const out: string[] = [];
  let i = 0;
  for (const s of sizes) {
    out.push(digits.slice(i, i + s));
    i += s;
  }
  return out.join(' ');
}

/**
 * Readable display format, e.g. "38761234567" → "+387 61 234 567".
 * `international` treats a number without "+" as already including the
 * country code (used for the WhatsApp setting, which wa.me requires).
 */
export function formatPhone(value: string | null | undefined, { international = false } = {}): string {
  if (!value) return '';
  const normalized = normalizePhone(value);
  const digits = normalized.replace('+', '');
  if (!digits) return value;
  if (!normalized.startsWith('+') && !international) return group(digits);
  const cc = ONE_DIGIT.has(digits[0]) ? 1 : TWO_DIGIT.has(digits.slice(0, 2)) ? 2 : 3;
  return `+${digits.slice(0, cc)} ${group(digits.slice(cc))}`.trim();
}

/** wa.me link for a WhatsApp number stored in international format. */
export function whatsappLink(value: string | null | undefined): string | null {
  const digits = normalizePhone(value).replace('+', '');
  return digits.length >= 6 ? `https://wa.me/${digits}` : null;
}

export function telLink(value: string): string {
  return `tel:${normalizePhone(value)}`;
}
