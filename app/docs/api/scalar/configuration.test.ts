import { describe, expect, it } from 'vitest';
import spec from '@/docs/openapi.json';
import { SCALAR_CONFIGURATION, SPEC_URL } from './configuration';

/**
 * Scalar fetches its spec at runtime, which means a wrong URL or a renamed security scheme produces
 * a page that renders and is simply empty or subtly wrong — no build error, no failing route. These
 * assertions are the compile step that arrangement does not have.
 */
describe('Scalar configuration', () => {
  it('points at the spec route the API actually serves', () => {
    expect(SPEC_URL).toBe('/api/v1/openapi.json');
    expect(SCALAR_CONFIGURATION.url).toBe(SPEC_URL);
  });

  it('prefers a security scheme the spec defines', () => {
    const schemes = Object.keys(spec.components?.securitySchemes ?? {});

    expect(schemes).toContain(SCALAR_CONFIGURATION.authentication.preferredSecurityScheme);
  });

  it('keeps Scalar’s own product surfaces off a page documenting Cicero', () => {
    expect(SCALAR_CONFIGURATION.showDeveloperTools).toBe('never');
    expect(SCALAR_CONFIGURATION.agent.disabled).toBe(true);
  });
});
