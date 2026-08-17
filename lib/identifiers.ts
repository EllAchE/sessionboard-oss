/**
 * Path segments reach a query before any Zod schema sees them: `parseQuery` guards the search
 * string, but `context.params` goes straight from the URL into a `where` clause. Postgres answers a
 * malformed `uuid` literal or a null byte inside a text comparison with a driver-level error, and a
 * driver-level error is an unrecognised throw — so a typo'd calendar link surfaces as a 500 when the
 * honest answer is 404. These predicates let a handler decide that before the round trip.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Slugs are `text`, so there is no column width to lean on. The bound exists to keep an arbitrarily
 * long path segment from becoming an arbitrarily long query parameter.
 */
const MAX_SLUG_LENGTH = 256;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** A code-point scan rather than a regex, so the range stays legible in review. */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * True when the value could plausibly name a row. False is not "not found" on its own — it means the
 * lookup would be a wasted round trip at best and a driver error at worst.
 */
export function isQueryableSlug(value: string): boolean {
  return value.length > 0 && value.length <= MAX_SLUG_LENGTH && !hasControlCharacter(value);
}
