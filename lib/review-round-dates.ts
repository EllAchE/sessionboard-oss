import { invalid } from './errors';

export type RoundDateWire = {
  opensAt: string | null;
  closesAt: string | null;
};

export type RoundDateDraft = {
  opensAt: string;
  closesAt: string;
};

type DateValue = Date | string | null | undefined;

function dateValue(value: DateValue): number | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
}

export function toLocalDateTimeInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function fromLocalDateTimeInput(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function toRoundDateDraft(dates: RoundDateWire): RoundDateDraft {
  return {
    opensAt: toLocalDateTimeInput(dates.opensAt),
    closesAt: toLocalDateTimeInput(dates.closesAt),
  };
}

export function fromRoundDateDraft(dates: RoundDateDraft): RoundDateWire {
  return {
    opensAt: fromLocalDateTimeInput(dates.opensAt),
    closesAt: fromLocalDateTimeInput(dates.closesAt),
  };
}

export function parseRoundDate(
  value: string | null | undefined,
  field: 'opensAt' | 'closesAt',
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  throw invalid('Enter a valid date and time', { [field]: 'Enter a valid date and time' });
}

export function roundDatesAreOutOfOrder(opensAt: DateValue, closesAt: DateValue): boolean {
  const opens = dateValue(opensAt);
  const closes = dateValue(closesAt);
  return opens !== null && closes !== null && closes <= opens;
}

export function assertRoundDateOrder(opensAt: DateValue, closesAt: DateValue): void {
  if (!roundDatesAreOutOfOrder(opensAt, closesAt)) return;
  throw invalid('The close date has to come after the open date', {
    closesAt: 'Pick a date after the open date',
  });
}

function formatRoundDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function describeRoundDates(dates: RoundDateWire): string {
  const parts = [
    dates.opensAt ? `Opens ${formatRoundDate(dates.opensAt)}` : null,
    dates.closesAt ? `Closes ${formatRoundDate(dates.closesAt)}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : 'Dates not set.';
}
