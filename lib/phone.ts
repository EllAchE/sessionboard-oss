import { z } from 'zod';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { env } from './env';

const E164 = /^\+[1-9]\d{7,14}$/;

export class InvalidPhoneNumberError extends Error {
  constructor(message = 'Enter a valid phone number, including its country code') {
    super(message);
    this.name = 'InvalidPhoneNumberError';
  }
}

/**
 * Stores one representation everywhere: E.164. National-format input uses the deployment's
 * default ISO country; libphonenumber's metadata knows where trunk prefixes are significant, which
 * cannot be inferred safely from a calling code alone.
 */
export function normalizePhoneNumber(input: string): string {
  const raw = input.trim();
  if (!raw) throw new InvalidPhoneNumberError();
  const defaultCountry = (env('SMS_DEFAULT_COUNTRY') ?? 'US').toUpperCase();
  if (!/^[A-Z]{2}$/.test(defaultCountry)) {
    throw new InvalidPhoneNumberError('SMS_DEFAULT_COUNTRY must be a two-letter ISO country code');
  }
  const international = raw.startsWith('00') ? `+${raw.slice(2)}` : raw;
  const parsed = parsePhoneNumberFromString(international, defaultCountry as CountryCode);
  // Possible rather than assigned/valid: fictional/test ranges and newly allocated exchanges still
  // have legitimate E.164 shape, while impossible lengths and country codes are refused.
  if (!parsed?.isPossible() || !E164.test(parsed.number)) throw new InvalidPhoneNumberError();
  return parsed.number;
}

/** Blank remains blank so profile/settings forms can clear the nullable column. */
export const e164PhoneInput = z.string().trim().max(40).transform((value, ctx) => {
  if (!value) return '';
  try {
    return normalizePhoneNumber(value);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : 'Enter a valid phone number',
    });
    return z.NEVER;
  }
});

export function isE164PhoneNumber(value: string): boolean {
  return E164.test(value);
}
