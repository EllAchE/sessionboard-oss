import type { ContactRow, CrmFieldRow, ProspectCard, PipelineColumn } from '@/lib/services/crm';
import type { CardWire, ColumnWire, ContactWire, FieldWire, FiltersWire } from './wire';

/**
 * `import type` only, so this stays importable from a server page without pulling the database into
 * anything a client component reads.
 */

export function toContactWire(row: ContactRow): ContactWire {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    jobTitle: row.jobTitle,
    company: row.company,
    location: row.location,
    source: row.source,
    bioMarkdown: row.bioMarkdown,
    headshotUrl: row.headshotUrl,
    tags: row.tags,
    customFields: row.customFields,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toFieldWire(row: CrmFieldRow): FieldWire {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    type: row.type,
    options: row.options,
  };
}

export function toCardWire(card: ProspectCard): CardWire {
  return {
    id: card.id,
    contactId: card.contactId,
    name: card.name,
    email: card.email,
    company: card.company,
    jobTitle: card.jobTitle,
    tags: card.tags,
    stage: card.stage,
    score: card.score,
    rationale: card.rationale,
    eventName: card.eventName,
    noteCount: card.noteCount,
  };
}

export function toColumnWire(column: PipelineColumn): ColumnWire {
  return {
    stage: column.stage,
    label: column.label,
    cards: column.cards.map(toCardWire),
  };
}

type RawSearchParams = Record<string, string | string[] | undefined>;

function one(params: RawSearchParams, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

export function filtersFromSearchParams(params: RawSearchParams): FiltersWire {
  const custom: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!key.startsWith('cf_')) continue;
    const single = Array.isArray(value) ? value[0] : value;
    if (single) custom[key.slice(3)] = single;
  }
  return {
    search: one(params, 'q'),
    company: one(params, 'company'),
    jobTitle: one(params, 'jobTitle'),
    tag: one(params, 'tag'),
    source: one(params, 'source'),
    location: one(params, 'location'),
    custom,
  };
}
