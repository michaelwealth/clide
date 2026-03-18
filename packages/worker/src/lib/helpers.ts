import { randomAlphanumeric } from './id';

/**
 * Generate a personalized slug from a first name.
 * Format: first 2 chars of firstname (lowercased) + random alphanumeric
 * 
 * @param firstname - The contact's first name
 * @param length - Total slug length (default: 5)
 */
export function generateSlug(firstname: string, length: number = 5): string {
  const prefix = firstname
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .slice(0, 2)
    .padEnd(2, 'x'); // Pad if name is very short
  
  const randomPart = randomAlphanumeric(length - 2);
  return prefix + randomPart;
}

/**
 * Generate a unique slug, retrying with longer length on collision.
 * Returns a slug guaranteed unique within the given set of existing slugs.
 */
export async function generateUniqueSlug(
  firstname: string,
  existingSlugs: Set<string>,
  maxAttempts: number = 10
): Promise<string> {
  let length = 5;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const slug = generateSlug(firstname, length);
    if (!existingSlugs.has(slug)) {
      return slug;
    }
    // On collision, increase length
    if (attempt >= 3) length++;
  }
  
  // Final fallback: use longer random slug
  return generateSlug(firstname, 8);
}

/**
 * Validate a campaign key format: {digit}{letter}
 */
export function isValidCampaignKey(key: string): boolean {
  return /^[0-9][a-z]$/.test(key);
}

/**
 * Validate phone number: Nigerian format or international
 */
export function normalizePhone(phone: string): string | null {
  // Strip all non-digit characters
  let digits = phone.replace(/\D/g, '');
  
  // Handle Nigerian numbers
  if (digits.startsWith('0') && digits.length === 11) {
    digits = '234' + digits.slice(1);
  }
  
  // Must be at least 10 digits
  if (digits.length < 10 || digits.length > 15) {
    return null;
  }
  
  return digits;
}

/**
 * Interpolate template variables in a message.
 * Supports: {firstname}, {link}, and any extra_data fields.
 */
export function interpolateTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return variables[key] ?? match;
  });
}
