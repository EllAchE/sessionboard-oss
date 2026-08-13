import { describe, expect, it } from 'vitest';
import type { SponsorKind, SponsorRecord } from '@/lib/services/sponsors';
import { buildSponsorWall } from './wall';

/**
 * `E-7`. The wall's only decisions are which sections exist and how tiers are grouped, and both have
 * an obvious wrong answer: sorting tiers alphabetically (Bronze above Gold), or heading a section
 * that has no tiers with a label the organizer never wrote.
 */

let seq = 0;

function row(partial: Partial<SponsorRecord> & { name: string }): SponsorRecord {
  seq += 1;
  return {
    id: `sponsor-${seq}`,
    kind: 'sponsor' as SponsorKind,
    tier: null,
    websiteUrl: null,
    description: null,
    boothLocation: null,
    logoFileId: null,
    position: seq,
    ...partial,
  };
}

describe('buildSponsorWall', () => {
  it('drops a kind with no rows rather than heading an empty section', () => {
    const wall = buildSponsorWall('forum', [row({ name: 'Aqua Marcia' })]);
    expect(wall.map((section) => section.kind)).toEqual(['sponsor']);
  });

  it('keeps sponsors before exhibitors', () => {
    const wall = buildSponsorWall('forum', [
      row({ name: 'Aqua Marcia' }),
      row({ kind: 'exhibitor', name: 'Fabri Tignuarii' }),
    ]);
    expect(wall.map((section) => section.kind)).toEqual(['sponsor', 'exhibitor']);
  });

  /** The reason tiers are not sorted: `position` is the organizer's ranking and text has none. */
  it('orders tiers by where they first appear, not alphabetically', () => {
    const wall = buildSponsorWall('forum', [
      row({ name: 'Aqua Marcia', tier: 'Gold' }),
      row({ name: 'Cloaca Maxima', tier: 'Gold' }),
      row({ name: 'Via Appia', tier: 'Bronze' }),
    ]);

    expect(wall[0].tiers.map((tier) => tier.label)).toEqual(['Gold', 'Bronze']);
    expect(wall[0].tiers[0].entries.map((entry) => entry.name)).toEqual([
      'Aqua Marcia',
      'Cloaca Maxima',
    ]);
  });

  it('gathers a tier met again later into the group it opened', () => {
    const wall = buildSponsorWall('forum', [
      row({ name: 'Aqua Marcia', tier: 'Gold' }),
      row({ name: 'Via Appia', tier: 'Bronze' }),
      row({ name: 'Cloaca Maxima', tier: 'Gold' }),
    ]);

    expect(wall[0].tiers.map((tier) => tier.label)).toEqual(['Gold', 'Bronze']);
    expect(wall[0].tiers[0].entries).toHaveLength(2);
  });

  it('renders one unlabelled block when nothing in the section carries a tier', () => {
    const wall = buildSponsorWall('forum', [
      row({ name: 'Aqua Marcia' }),
      row({ name: 'Via Appia' }),
    ]);

    expect(wall[0].tiers).toHaveLength(1);
    expect(wall[0].tiers[0].label).toBeNull();
  });

  it('labels the untiered run only when there are tiers to tell it apart from', () => {
    const wall = buildSponsorWall('forum', [
      row({ name: 'Aqua Marcia', tier: 'Gold' }),
      row({ name: 'Via Appia' }),
    ]);

    expect(wall[0].tiers.map((tier) => tier.label)).toEqual(['Gold', 'Also supporting']);
  });

  it('heads the untiered run with the kind that is doing it, not with the sponsor wording', () => {
    const wall = buildSponsorWall('forum', [
      row({ kind: 'exhibitor', name: 'Officina Ferraria', tier: 'Standard' }),
      row({ kind: 'exhibitor', name: 'Horrea Publica' }),
    ]);

    expect(wall[0].tiers.map((tier) => tier.label)).toEqual(['Standard', 'Also exhibiting']);
  });

  it('counts the section flat, not by tier', () => {
    const wall = buildSponsorWall('forum', [
      row({ name: 'Aqua Marcia', tier: 'Gold' }),
      row({ name: 'Via Appia', tier: 'Bronze' }),
      row({ name: 'Cloaca Maxima', tier: 'Bronze' }),
    ]);
    expect(wall[0].count).toBe(3);
  });

  it('points a logo at the public route for this event, and leaves a missing one null', () => {
    const wall = buildSponsorWall('forum', [
      row({ name: 'Aqua Marcia', logoFileId: 'file-1' }),
      row({ name: 'Via Appia' }),
    ]);

    const [withLogo, without] = wall[0].tiers[0].entries;
    expect(withLogo.logoUrl).toBe('/forum/sponsors/logo/file-1');
    expect(without.logoUrl).toBeNull();
  });

  it('carries the booth through, which is the only field an exhibitor has and a sponsor does not', () => {
    const wall = buildSponsorWall('forum', [
      row({ kind: 'exhibitor', name: 'Fabri Tignuarii', boothLocation: 'B12' }),
    ]);
    expect(wall[0].tiers[0].entries[0].boothLocation).toBe('B12');
  });
});
