import { describe, expect, it } from 'vitest';
import {
  buildImportPreview,
  contactMatches,
  duplicateGroups,
  mergeContactValues,
  mergeValuesFor,
  normalizeName,
  parseTagList,
  previewCampaign,
  renderMergeTags,
  resolveSegmentMembers,
  suggestMapping,
  type ContactRow,
} from './crm';
import { parseCsvTable } from '../csv';

/**
 * Two rules carry the area. A merge that drops a field silently destroys the only copy of a bio,
 * and a segment that resolves the wrong way turns "everyone I invited last year" into a mailing
 * list of strangers — both fail quietly, long after the action that caused them.
 */

function contactOf(
  over: Partial<ContactRow> & { id: string; name: string; email: string },
): ContactRow {
  return {
    ownerUserId: 'owner',
    jobTitle: null,
    company: null,
    bioMarkdown: null,
    headshotUrl: null,
    location: null,
    source: null,
    tags: [],
    customFields: {},
    mergedIntoContactId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  } as ContactRow;
}

const AMARA_A = contactOf({
  id: 'a',
  name: 'Amara Okonkwo',
  email: 'amara@helioslabs.io',
  company: 'Helios Labs',
  tags: ['AI'],
  customFields: { 'speaker-type': 'External' },
  createdAt: new Date('2026-01-01T00:00:00Z'),
});

const AMARA_B = contactOf({
  id: 'b',
  name: 'amara  okonkwo',
  email: 'a.okonkwo@heliosresearch.org',
  jobTitle: 'Head of AI Research',
  bioMarkdown: 'Runs the ethics review board.',
  tags: ['Ethics', 'ai'],
  customFields: { 'speaker-type': 'Internal', region: 'EMEA' },
  createdAt: new Date('2026-02-01T00:00:00Z'),
});

describe('merge', () => {
  it("keeps the primary's own value and fills only its gaps from the loser", () => {
    const merged = mergeContactValues(AMARA_A, [AMARA_B]);
    expect(merged.email).toBe('amara@helioslabs.io');
    expect(merged.company).toBe('Helios Labs');
    expect(merged.jobTitle).toBe('Head of AI Research');
    expect(merged.bioMarkdown).toBe('Runs the ethics review board.');
  });

  it('lets an explicit field choice beat both records', () => {
    const merged = mergeContactValues(AMARA_A, [AMARA_B], {
      email: 'a.okonkwo@heliosresearch.org',
      company: 'Helios Research',
    });
    expect(merged.email).toBe('a.okonkwo@heliosresearch.org');
    expect(merged.company).toBe('Helios Research');
  });

  it('ignores a blank choice rather than blanking the field', () => {
    const merged = mergeContactValues(AMARA_A, [AMARA_B], { company: '   ' });
    expect(merged.company).toBe('Helios Labs');
  });

  it('unions tags case-insensitively, primary first', () => {
    expect(mergeContactValues(AMARA_A, [AMARA_B]).tags).toEqual(['AI', 'Ethics']);
  });

  it('merges custom fields with the primary winning every collision', () => {
    expect(mergeContactValues(AMARA_A, [AMARA_B]).customFields).toEqual({
      'speaker-type': 'External',
      region: 'EMEA',
    });
  });

  it('surfaces the same name under different emails as one group', () => {
    const groups = duplicateGroups([
      AMARA_A,
      AMARA_B,
      contactOf({ id: 'c', name: 'Bjorn', email: 'b@x.io' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].contacts.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('normalizes accents and punctuation before comparing names', () => {
    expect(normalizeName('Tomás  Rivera-Núñez')).toBe(normalizeName('tomas rivera nunez'));
  });
});

describe('segments', () => {
  const roster = [
    AMARA_A,
    AMARA_B,
    contactOf({ id: 'c', name: 'Bjorn', email: 'b@x.io', tags: ['Platform'] }),
  ];

  it('re-runs the filter for a dynamic segment, so a later arrival joins on its own', () => {
    const segment = {
      kind: 'dynamic' as const,
      filters: { tag: 'AI' },
      memberContactIds: [],
    };
    expect(resolveSegmentMembers(segment, [AMARA_A]).map((row) => row.id)).toEqual(['a']);
    expect(resolveSegmentMembers(segment, roster).map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('returns the stored ids for a curated segment even when the filter would match more', () => {
    const segment = {
      kind: 'curated' as const,
      filters: { tag: 'AI' },
      memberContactIds: ['a'],
    };
    expect(resolveSegmentMembers(segment, roster).map((row) => row.id)).toEqual(['a']);
  });

  it('drops a curated member that no longer exists rather than inventing a row', () => {
    const segment = {
      kind: 'curated' as const,
      filters: {},
      memberContactIds: ['a', 'gone'],
    };
    expect(resolveSegmentMembers(segment, roster).map((row) => row.id)).toEqual(['a']);
  });

  it('matches everything when a dynamic segment has no filter', () => {
    const segment = {
      kind: 'dynamic' as const,
      filters: {},
      memberContactIds: [],
    };
    expect(resolveSegmentMembers(segment, roster)).toHaveLength(3);
  });
});

describe('directory filters', () => {
  it('narrows on search across name, email, company and tags', () => {
    expect(contactMatches(AMARA_A, { search: 'okonkwo' })).toBe(true);
    expect(contactMatches(AMARA_A, { search: 'helios' })).toBe(true);
    expect(contactMatches(AMARA_A, { search: 'bjorn' })).toBe(false);
  });

  it('ANDs two criteria instead of widening', () => {
    expect(contactMatches(AMARA_A, { company: 'Helios Labs', tag: 'AI' })).toBe(true);
    expect(contactMatches(AMARA_A, { company: 'Helios Labs', tag: 'Ethics' })).toBe(false);
  });

  it('matches a custom field value exactly', () => {
    expect(contactMatches(AMARA_A, { custom: { 'speaker-type': 'External' } })).toBe(true);
    expect(contactMatches(AMARA_A, { custom: { 'speaker-type': 'Internal' } })).toBe(false);
  });
});

describe('csv import', () => {
  const csv =
    'Full Name,Email Address,Job Title,Company,Tags\nAda Lovelace,ada@example.com,Analyst,Analytical Engine,"AI, Maths"\n,broken@example.com,,,\nAda Lovelace,not-an-email,,,\n';

  it('maps spelled-out headers onto the contact fields', () => {
    const mapping = suggestMapping(parseCsvTable(csv).headers);
    expect(mapping.name).toBe('Full Name');
    expect(mapping.email).toBe('Email Address');
    expect(mapping.jobTitle).toBe('Job Title');
  });

  it('flags the problem rows with their line numbers and leaves them out', () => {
    const table = parseCsvTable(csv);
    const preview = buildImportPreview(table, suggestMapping(table.headers), []);
    expect(preview.counts).toEqual({ create: 1, update: 0, skip: 2 });
    expect(preview.rows[1].issues[0].message).toBe('Missing name');
    expect(preview.rows[2].line).toBe(4);
  });

  it('marks a known address as an update rather than a duplicate', () => {
    const table = parseCsvTable(csv);
    const preview = buildImportPreview(table, suggestMapping(table.headers), ['ada@example.com']);
    expect(preview.rows[0].action).toBe('update');
    expect(preview.rows[0].issues[0].severity).toBe('warning');
  });

  it('splits a tag cell on commas and semicolons', () => {
    expect(parseTagList('AI, Maths; AI')).toEqual(['AI', 'Maths']);
  });
});

describe('merge tags', () => {
  it('resolves personalization against a real contact', () => {
    const preview = previewCampaign(
      'Speak at DevFlow Conf 2027?',
      'Hi {{first_name}}, we loved your {{company}} talk.',
      AMARA_A,
    );
    expect(preview.body).toBe('Hi Amara, we loved your Helios Labs talk.');
  });

  it('renders an unknown tag as nothing rather than leaving braces in an inbox', () => {
    expect(renderMergeTags('Hi {{ nope }}!', {})).toBe('Hi !');
  });

  /**
   * `F-6`. A contact carries one `name` string, so there is no `first_name` column to read here —
   * but there is exactly one rule in this app for cutting a name in half, and this tag used to use a
   * different one. The greeting a prospect gets from a campaign is now the same given name their
   * account will show them once they accept and sign in.
   */
  it('cuts a first name the same way every other surface does', () => {
    expect(mergeValuesFor({ ...AMARA_A, name: 'Marcus Tullius Cicero' }).first_name).toBe(
      'Marcus Tullius',
    );
    expect(mergeValuesFor({ ...AMARA_A, name: 'Cicero' }).first_name).toBe('Cicero');
    expect(mergeValuesFor({ ...AMARA_A, name: '  Ada   Lovelace ' }).first_name).toBe('Ada');
    expect(mergeValuesFor({ ...AMARA_A, name: '   ' }).first_name).toBe('');
  });
});
