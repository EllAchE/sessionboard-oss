/**
 * The serializable shapes the CRM's client components read. Nothing here imports the database, so
 * a `'use client'` island can hold these types and values without dragging `pg` into the bundle.
 */

export type ContactWire = {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  company: string | null;
  location: string | null;
  source: string | null;
  bioMarkdown: string | null;
  headshotUrl: string | null;
  tags: string[];
  customFields: Record<string, string>;
  createdAt: string;
};

export type FieldWire = {
  id: string;
  key: string;
  label: string;
  type: string;
  options: string[];
};

export type FacetsWire = {
  companies: string[];
  jobTitles: string[];
  tags: string[];
  sources: string[];
  locations: string[];
};

export type FiltersWire = {
  search: string;
  company: string;
  jobTitle: string;
  tag: string;
  source: string;
  location: string;
  custom: Record<string, string>;
};

export type EventWire = { id: string; name: string; slug: string };

export type StageWire = { stage: string; label: string };

export type CardWire = {
  id: string;
  contactId: string;
  name: string;
  email: string;
  company: string | null;
  jobTitle: string | null;
  tags: string[];
  stage: string;
  score: number | null;
  rationale: string | null;
  eventName: string | null;
  noteCount: number;
};

export type ColumnWire = { stage: string; label: string; cards: CardWire[] };

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

export const EMPTY_FILTERS: FiltersWire = {
  search: '',
  company: '',
  jobTitle: '',
  tag: '',
  source: '',
  location: '',
  custom: {},
};

/**
 * The client-side twin of `contactMatches` in `lib/services/crm.ts`, which stays the authority —
 * it is what resolves a saved segment. This exists so typing in the search box narrows the table
 * on the keystroke rather than on a round trip, and it is deliberately only exact-value equality
 * plus a substring test so the two cannot disagree about a row the organizer can see.
 */
export function matchesWire(row: ContactWire, filters: FiltersWire): boolean {
  const same = (value: string | null, wanted: string) =>
    (value ?? '').trim().toLowerCase() === wanted.trim().toLowerCase();

  const search = filters.search.trim().toLowerCase();
  if (search !== '') {
    const haystack = [row.name, row.email, row.company, row.jobTitle, row.location, ...row.tags]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  if (filters.company !== '' && !same(row.company, filters.company)) return false;
  if (filters.jobTitle !== '' && !same(row.jobTitle, filters.jobTitle)) return false;
  if (filters.source !== '' && !same(row.source, filters.source)) return false;
  if (filters.location !== '' && !same(row.location, filters.location)) return false;
  if (filters.tag !== '' && !row.tags.some((tag) => same(tag, filters.tag))) return false;
  for (const [key, value] of Object.entries(filters.custom)) {
    if (value !== '' && !same(row.customFields[key] ?? null, value)) return false;
  }
  return true;
}

export const MERGE_TAG_KEYS = ['first_name', 'name', 'company', 'job_title', 'email'] as const;

/**
 * The client-side twin of `mergeValuesFor` and `renderMergeTags` in `lib/services/crm.ts`, which
 * stay the authority — they are what the sent message is rendered with. This exists so the composer
 * can show a preview resolved against a real recipient while the organizer types, and it must keep
 * the service's rule that an unresolved tag renders empty rather than as itself.
 */
export function renderMergeTagsWire(template: string, row: ContactWire): string {
  const values: Record<string, string> = {
    first_name: row.name.trim().split(/\s+/)[0] ?? '',
    name: row.name,
    company: row.company ?? '',
    job_title: row.jobTitle ?? '',
    email: row.email,
  };
  return template.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (_, key: string) => values[key] ?? '');
}

export function activeFilterCount(filters: FiltersWire): number {
  const scalar = [filters.company, filters.jobTitle, filters.tag, filters.source, filters.location];
  return (
    scalar.filter((value) => value !== '').length +
    Object.values(filters.custom).filter((value) => value !== '').length
  );
}

export function filtersToQuery(filters: FiltersWire): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set('q', filters.search);
  if (filters.company) params.set('company', filters.company);
  if (filters.jobTitle) params.set('jobTitle', filters.jobTitle);
  if (filters.tag) params.set('tag', filters.tag);
  if (filters.source) params.set('source', filters.source);
  if (filters.location) params.set('location', filters.location);
  for (const [key, value] of Object.entries(filters.custom)) {
    if (value) params.set(`cf_${key}`, value);
  }
  return params;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
