/**
 * ULID-like ID generator for Cloudflare Workers (no crypto.getRandomValues dependency issues).
 * Time-sortable, URL-safe, unique across distributed workers.
 */

const ENCODING = '0123456789abcdefghjkmnpqrstvwxyz'; // Crockford Base32
const ENCODING_LEN = ENCODING.length;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(now: number, len: number): string {
  let str = '';
  for (let i = len; i > 0; i--) {
    const mod = now % ENCODING_LEN;
    str = ENCODING[mod] + str;
    now = (now - mod) / ENCODING_LEN;
  }
  return str;
}

function encodeRandom(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let str = '';
  for (let i = 0; i < len; i++) {
    str += ENCODING[bytes[i] % ENCODING_LEN];
  }
  return str;
}

export function generateId(): string {
  const now = Date.now();
  return encodeTime(now, TIME_LEN) + encodeRandom(RANDOM_LEN);
}

/**
 * Generate a short random string of specified length.
 */
export function randomAlphanumeric(length: number): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'; // no ambiguous chars
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * Generate a campaign key in {digit}{letter} format.
 */
export function generateCampaignKey(): string {
  const digits = '0123456789';
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  return digits[bytes[0] % 10] + letters[bytes[1] % 26];
}
