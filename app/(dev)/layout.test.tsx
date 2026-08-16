import { beforeEach, describe, expect, it, vi } from 'vitest';

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound }));

import DevelopmentLayout from './layout';

describe('DevelopmentLayout', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    notFound.mockClear();
  });

  it('renders design labs outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(DevelopmentLayout({ children: 'lab' })).toBe('lab');
    expect(notFound).not.toHaveBeenCalled();
  });

  it('returns not found for every development route in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => DevelopmentLayout({ children: 'lab' })).toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledOnce();
  });
});
