import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  fileURLToPath(new URL('./0015_charming_sebastian_shaw.sql', import.meta.url)),
  'utf8',
);

describe('0015 recipient notification controls', () => {
  it('adds ownership proof without grandfathering an existing phone as verified', () => {
    expect(sql).toContain('"phone_verified_at" timestamp with time zone');
    expect(sql).toContain('"phone_verification_challenge"');
    expect(sql).not.toMatch(/UPDATE "user"[^;]*"phone_verified_at"/s);
    expect(sql).toContain('"phone_verification_transport" text');
    expect(sql).toContain("in ('log', 'twilio')");
  });

  it('keeps preference rows uniquely scoped and bounds delivery controls', () => {
    expect(sql).toContain('"notification_preference_user_scope_template"');
    expect(sql).toContain('between 0 and 1439');
    expect(sql).toContain('between 1 and 100');
    expect(sql).toContain('notification_preference_quiet_window_check');
  });

  it('stores only an unsubscribe token digest and its exact user, event and type scope', () => {
    expect(sql).toContain('"token_hash" text NOT NULL');
    expect(sql).toContain('"user_id" uuid NOT NULL');
    expect(sql).toContain('"event_id" uuid NOT NULL');
    expect(sql).toContain('"template_key" text NOT NULL');
    expect(sql).not.toContain('"token" text');
  });
});
