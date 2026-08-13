import { describe, expect, it } from 'vitest';
import { createSubmissionBody } from './schemas';

describe('createSubmissionBody speaker name', () => {
  it('preserves legitimate international names', () => {
    const result = createSubmissionBody.parse({
      email: 'speaker@example.com',
      name: 'ليلى الأحمد',
      answers: {},
    });
    expect(result.name).toBe('ليلى الأحمد');
  });

  it('rejects directional controls before any submission service runs', () => {
    const result = createSubmissionBody.safeParse({
      email: 'speaker@example.com',
      name: 'Ada\u202ELovelace',
      answers: {},
    });
    expect(result.success).toBe(false);
  });
});
