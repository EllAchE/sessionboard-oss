import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  fileURLToPath(new URL('./0013_high_makkari.sql', import.meta.url)),
  'utf8',
);

describe('0013 API controls migration', () => {
  it('preserves the authority of existing API keys during the scope migration', () => {
    expect(sql).toContain(
      'ALTER TABLE "api_key" ADD COLUMN "scope" "api_key_scope" DEFAULT \'write\' NOT NULL',
    );
  });

  it('keeps one bounded current rate-limit counter per hashed identity', () => {
    expect(sql).toContain('CREATE TABLE "inbound_rate_limit"');
    expect(sql).toContain('"key_hash" text PRIMARY KEY NOT NULL');
    expect(sql).not.toContain('"client_ip"');
  });

  it('persists webhook subscriptions and every delivery outcome', () => {
    expect(sql).toContain('CREATE TABLE "webhook_endpoint"');
    expect(sql).toContain('CREATE TABLE "webhook_delivery"');
    expect(sql).toContain('"signing_secret" text NOT NULL');
    expect(sql).toContain('"response_status" integer');
    expect(sql).toContain('"error" text');
  });
});
