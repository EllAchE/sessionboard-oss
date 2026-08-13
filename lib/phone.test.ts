import { afterEach, describe, expect, it, vi } from 'vitest';
import { e164PhoneInput, normalizePhoneNumber } from './phone';

afterEach(() => vi.unstubAllEnvs());

describe('normalizePhoneNumber', () => {
  it.each([
    ['+1 (415) 867-5310', '+14158675310'],
    ['00442079460958', '+442079460958'],
    ['(415) 867-5310', '+14158675310'],
    ['1-415-867-5310', '+14158675310'],
  ])('normalizes %s to E.164', (input, expected) => {
    expect(normalizePhoneNumber(input)).toBe(expected);
  });

  it('uses the deployment calling code for national-format input', () => {
    vi.stubEnv('SMS_DEFAULT_COUNTRY', 'GB');
    expect(normalizePhoneNumber('020 7946 0958')).toBe('+442079460958');
  });

  it('preserves a significant Italian leading zero', () => {
    vi.stubEnv('SMS_DEFAULT_COUNTRY', 'IT');
    expect(normalizePhoneNumber('02 36618 300')).toBe('+390236618300');
  });

  it.each(['555', '+0123456789', '+1 555 FLOWERS', '++14158675310'])('rejects %s', (input) => {
    expect(() => normalizePhoneNumber(input)).toThrow('Enter a valid phone number');
  });

  it('keeps blank form input blank so a nullable phone can be cleared', () => {
    expect(e164PhoneInput.parse('  ')).toBe('');
  });
});
