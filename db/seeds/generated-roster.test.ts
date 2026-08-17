import { describe, expect, it } from 'vitest';
import { undeliverableRecipient } from '../../lib/mail/config';
import { ALL_EVENT_SIZES, EVENT_SIZES, generatedEmailDomain } from './event-sizes';
import { generateProposals, generateSpeakers, generatedSpeakerAt } from './generated-roster';

/**
 * The generator's whole job is to be boring in exactly two ways: the same index always gives the
 * same person, and no two indices give the same email. Both are load-bearing and neither is
 * enforced by a type — a collision surfaces as a unique-constraint failure halfway through a seed
 * run, and a drift surfaces as every screenshot in the docs going stale at once.
 *
 * The largest size is the one worth asserting at: it is where the name tables wrap.
 */

const LARGE = EVENT_SIZES.large;
const DOMAIN = generatedEmailDomain(LARGE);

describe('generated speakers', () => {
  it('is a pure function of the index', () => {
    for (const index of [0, 1, 7, 42, 179]) {
      expect(generatedSpeakerAt(index, DOMAIN)).toEqual(generatedSpeakerAt(index, DOMAIN));
    }
  });

  it('gives every speaker at the largest size a distinct address', () => {
    const emails = generateSpeakers(LARGE.speakers, { domain: DOMAIN }).map((s) => s.email);
    expect(new Set(emails).size).toBe(LARGE.speakers);
  });

  /** The reviewer block in `sized-demo.ts` starts at 1000; it must not reach back into the roster. */
  it('keeps the reviewer index block clear of the speaker block', () => {
    const speakers = generateSpeakers(LARGE.speakers, { domain: DOMAIN });
    const reviewers = Array.from({ length: LARGE.reviewers }, (_, i) =>
      generatedSpeakerAt(1000 + i, DOMAIN),
    );
    const all = [...speakers, ...reviewers].map((person) => person.email);
    expect(new Set(all).size).toBe(all.length);
  });

  it('gives distinct names, not just distinct addresses', () => {
    const names = generateSpeakers(LARGE.speakers, { domain: DOMAIN }).map((s) => s.name);
    expect(new Set(names).size).toBe(LARGE.speakers);
  });

  /**
   * `lib/demo-access.ts` will only print an on-screen magic link for an address no mailbox can exist
   * behind. Moving these people to a deliverable domain would turn that convenience into a way to
   * take over an account, so the property is asserted rather than left to the domain constant.
   */
  it('puts every generated person at a reserved domain', () => {
    for (const size of ALL_EVENT_SIZES) {
      const speakers = generateSpeakers(size.speakers, { domain: generatedEmailDomain(size) });
      expect(speakers.every((speaker) => undeliverableRecipient(speaker.email))).toBe(true);
    }
  });

  it('stays close to an even gender split at every size', () => {
    for (const size of ALL_EVENT_SIZES) {
      const speakers = generateSpeakers(size.speakers, { domain: generatedEmailDomain(size) });
      const women = speakers.filter((speaker) => speaker.gender === 'woman').length;
      expect(Math.abs(women - speakers.length / 2)).toBeLessThanOrEqual(1);
    }
  });

  it('fills in the profile fields the public roster renders', () => {
    for (const speaker of generateSpeakers(24, { domain: DOMAIN })) {
      expect(speaker.title.length).toBeGreaterThan(0);
      expect(speaker.organization.length).toBeGreaterThan(0);
      expect(speaker.bio.length).toBeGreaterThan(40);
    }
  });

  /** `startIndex` is how `demo` continues past its seven hand-authored speakers. */
  it('offsets cleanly from a start index', () => {
    const offset = generateSpeakers(5, { domain: DOMAIN, startIndex: 7 });
    const full = generateSpeakers(12, { domain: DOMAIN });
    expect(offset).toEqual(full.slice(7));
  });
});

describe('generated proposals', () => {
  const speakers = generateSpeakers(LARGE.speakers, { domain: DOMAIN });
  const proposals = generateProposals(speakers, {
    count: LARGE.submissions,
    acceptedCount: LARGE.speakers,
  });

  it('accepts exactly one proposal per speaker', () => {
    const accepted = proposals.filter((proposal) => proposal.status === 'accepted');
    expect(accepted).toHaveLength(LARGE.speakers);
    expect(new Set(accepted.map((proposal) => proposal.email)).size).toBe(LARGE.speakers);
  });

  /**
   * A programme with the same title twice makes the agenda look like a rendering bug. Topics and
   * framings are paired by coprime stride precisely so this holds up to 480 proposals.
   */
  it('gives every proposal at the largest size a distinct title', () => {
    expect(new Set(proposals.map((proposal) => proposal.title)).size).toBe(LARGE.submissions);
  });

  it('leaves a real queue behind the accepted set', () => {
    const statuses = new Set(proposals.map((proposal) => proposal.status));
    expect(statuses.has('under_review')).toBe(true);
    expect(statuses.has('declined')).toBe(true);
    expect(statuses.has('waitlisted')).toBe(true);
  });

  it('only ever names a speaker that exists', () => {
    const known = new Set(speakers.map((speaker) => speaker.email));
    expect(proposals.every((proposal) => known.has(proposal.email))).toBe(true);
  });

  it('is a pure function of its inputs', () => {
    expect(
      generateProposals(speakers, { count: 20, acceptedCount: 8, titleOffset: 14 }),
    ).toEqual(generateProposals(speakers, { count: 20, acceptedCount: 8, titleOffset: 14 }));
  });

  /** `demo` starts its generated proposals after the fourteen hand-written ones. */
  it('does not repeat a hand-authored slot when offset', () => {
    const offsetTitles = generateProposals(speakers, {
      count: 30,
      acceptedCount: 10,
      titleOffset: 14,
    }).map((proposal) => proposal.title);
    const baseTitles = generateProposals(speakers, { count: 14, acceptedCount: 7 }).map(
      (proposal) => proposal.title,
    );
    expect(offsetTitles.filter((title) => baseTitles.includes(title))).toEqual([]);
  });
});
