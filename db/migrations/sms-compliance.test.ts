import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  fileURLToPath(new URL('./0013_dazzling_scarlet_spider.sql', import.meta.url)),
  'utf8',
);

describe('0013 SMS compliance upgrade', () => {
  it('adds the final carrier states and a provider-SID lookup', () => {
    expect(sql).toContain("ADD VALUE 'delivered'");
    expect(sql).toContain("ADD VALUE 'undelivered'");
    expect(sql).toContain('"sms_log_provider_message_idx"');
    expect(sql).toContain('"status_updated_at"');
  });

  it('requires renewed consent instead of grandfathering old preferences', () => {
    expect(sql).toContain("'opted_out'::\"sms_consent_status\", 'migration_reconsent'");
    expect(sql).toMatch(/UPDATE "user" SET "notify_sms" = false/);
    expect(sql).not.toMatch(/'opted_in', 'migration_reconsent'/);
  });

  it('normalizes or clears legacy values before enforcing E.164 at rest', () => {
    const cleanup = sql.indexOf('UPDATE "user"\nSET "phone"');
    const constraint = sql.indexOf('ADD CONSTRAINT "user_phone_e164_check"');
    expect(cleanup).toBeGreaterThan(-1);
    expect(constraint).toBeGreaterThan(cleanup);
    expect(sql).toContain("'^\\+[1-9][0-9]{7,14}$'");
    expect(sql).toContain('ELSE NULL');
  });
});
