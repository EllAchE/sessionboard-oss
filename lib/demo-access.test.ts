import { afterEach, describe, expect, it, vi } from 'vitest';

const { getCloudflareContext } = vi.hoisted(() => ({ getCloudflareContext: vi.fn() }));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext }));

import {
  demoEventSlugs,
  demoSignInEmail,
  magicLinkPrecheck,
  membershipsAreDemoOnly,
} from './demo-access';

const DEMO = ['demo', 'first-settlement'];

afterEach(() => {
  vi.unstubAllEnvs();
  getCloudflareContext.mockReset();
});

function enableOnScreenLinks(): void {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('DEMO_ONSCREEN_MAGIC_LINKS', '1');
}

describe('which addresses may be shown a magic link', () => {
  it('shows every link on an instance that delivers nothing to anyone', () => {
    expect(magicLinkPrecheck('log', 'real.organizer@acme.com')).toBe('instance-delivers-nothing');
  });

  it('shows nothing under a real transport unless the deployment opted in', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(magicLinkPrecheck('resend', 'organizer@example.com')).toBeNull();
    expect(magicLinkPrecheck('smtp', 'organizer@example.com')).toBeNull();
    expect(magicLinkPrecheck('twilio', 'organizer@example.com')).toBeNull();
  });

  it('refuses every deliverable address even with the flag on', () => {
    enableOnScreenLinks();
    for (const address of [
      'real.organizer@acme.com',
      'someone@gmail.com',
      'admin@example.com.evil.net',
      'spoof@example.computer',
      'nodomain',
    ]) {
      expect(magicLinkPrecheck('resend', address), address).toBeNull();
    }
  });

  it('sends reserved-domain addresses on to the account check, and only them', () => {
    enableOnScreenLinks();
    for (const address of [
      'organizer@example.com',
      'octavian@first-settlement.example',
      'someone@EXAMPLE.ORG',
      'trailing@example.com.',
      'reviewer@example.test',
    ]) {
      expect(magicLinkPrecheck('resend', address), address).toBe('ask-the-database');
      expect(magicLinkPrecheck('twilio', address), address).toBe('ask-the-database');
    }
  });
});

describe('which accounts count as seeded demo identities', () => {
  it('accepts an account that only exists inside the demo', () => {
    expect(
      membershipsAreDemoOnly('demo-organizer', [{ slug: 'demo', ownerUserId: 'demo-organizer' }], DEMO),
    ).toBe(true);
  });

  it('accepts the judge who created their own event beside the seed', () => {
    expect(
      membershipsAreDemoOnly(
        'demo-organizer',
        [
          { slug: 'first-settlement', ownerUserId: 'demo-organizer' },
          { slug: 'my-trial-conference', ownerUserId: 'demo-organizer' },
        ],
        DEMO,
      ),
    ).toBe(true);
  });

  it('closes the path once a real event grants the identity access', () => {
    expect(
      membershipsAreDemoOnly(
        'demo-organizer',
        [
          { slug: 'demo', ownerUserId: 'demo-organizer' },
          { slug: 'acme-summit', ownerUserId: 'someone-else' },
        ],
        DEMO,
      ),
    ).toBe(false);
  });

  it('refuses an account with no demo membership at all', () => {
    expect(membershipsAreDemoOnly('stranger', [], DEMO)).toBe(false);
    expect(
      membershipsAreDemoOnly('stranger', [{ slug: 'acme-summit', ownerUserId: 'stranger' }], DEMO),
    ).toBe(false);
  });
});

describe('demo configuration', () => {
  it('advertises no demo address unless the deployment opted in', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(demoSignInEmail()).toBeNull();
  });

  it('advertises the seeded organizer once enabled, and honours an override', () => {
    enableOnScreenLinks();
    expect(demoSignInEmail()).toBe('organizer@example.com');
    vi.stubEnv('DEMO_SIGNIN_EMAIL', 'consul@first-settlement.example');
    expect(demoSignInEmail()).toBe('consul@first-settlement.example');
  });

  it('defaults to both seeded events and accepts a comma-separated override', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(demoEventSlugs()).toEqual(DEMO);
    vi.stubEnv('DEMO_EVENT_SLUGS', ' Sandbox , showcase ,');
    expect(demoEventSlugs()).toEqual(['sandbox', 'showcase']);
  });
});
