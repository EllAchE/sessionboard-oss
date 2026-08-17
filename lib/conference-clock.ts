export type ConferenceClockPhase = "upcoming" | "live" | "complete";

export type ConferenceClock = {
  phase: ConferenceClockPhase;
  label: string;
  remaining: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null;
};

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function dateParts(date: string): [number, number, number] {
  const [year, month, day] = date.split("-").map(Number);
  return [year, month, day];
}

function partsAt(
  timestamp: number,
  timeZone: string,
): [number, number, number, number, number, number] {
  const values = new Map(
    new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(timestamp))
      .map((part) => [part.type, Number(part.value)]),
  );

  return [
    values.get("year") ?? 0,
    values.get("month") ?? 0,
    values.get("day") ?? 0,
    values.get("hour") ?? 0,
    values.get("minute") ?? 0,
    values.get("second") ?? 0,
  ];
}

export function startOfDate(date: string, timeZone: string): number {
  const [year, month, day] = dateParts(date);
  const desired = Date.UTC(year, month - 1, day);
  let candidate = desired;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [localYear, localMonth, localDay, hour, minute, second] = partsAt(
      candidate,
      timeZone,
    );
    const represented = Date.UTC(
      localYear,
      localMonth - 1,
      localDay,
      hour,
      minute,
      second,
    );
    candidate += desired - represented;
  }

  return candidate;
}

function nextDate(date: string): string {
  const [year, month, day] = dateParts(date);
  return new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
}

function remainingUntil(
  target: number,
  now: number,
): ConferenceClock["remaining"] {
  const remaining = Math.max(0, target - now);
  return {
    days: Math.floor(remaining / DAY),
    hours: Math.floor((remaining % DAY) / HOUR),
    minutes: Math.floor((remaining % HOUR) / MINUTE),
    seconds: Math.floor((remaining % MINUTE) / SECOND),
  };
}

export function conferenceClock(
  startsOn: string,
  endsOn: string | null,
  timeZone: string,
  now: number,
): ConferenceClock {
  const startsAt = startOfDate(startsOn, timeZone);
  const endsAt = Math.max(
    startOfDate(nextDate(endsOn ?? startsOn), timeZone),
    startsAt + DAY,
  );

  if (now < startsAt) {
    return {
      phase: "upcoming",
      label: "Conference begins",
      remaining: remainingUntil(startsAt, now),
    };
  }

  if (now < endsAt) {
    return {
      phase: "live",
      label: "Conference ends in",
      remaining: remainingUntil(endsAt, now),
    };
  }

  return {
    phase: "complete",
    label: "Conference complete",
    remaining: null,
  };
}
