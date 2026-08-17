/**
 * A database that is refusing connections, timing out, or shedding queries is not the same failure
 * as a bug in a handler, but both arrive at `handle()` as an unrecognised throw and both come back
 * as a flat 500. That matters to the callers this API actually has: an embed on a partner's site and
 * a scheduled integration read a 500 as "this is broken, stop", and a 503 with `Retry-After` as
 * "come back shortly" — which is the truth, and the difference between an outage that heals itself
 * and one that leaves stale embeds behind.
 *
 * Drizzle rethrows with the original driver error on `cause`, so the whole chain gets walked.
 */

/** `pg` surfaces socket failures as Node `code`s. */
const TRANSPORT_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
]);

/** SQLSTATEs the server itself returns when it cannot serve the query rather than cannot parse it. */
const UNAVAILABLE_SQLSTATES = new Set([
  '08000', // connection_exception
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08003', // connection_does_not_exist
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
  '08006', // connection_failure
  '08007', // transaction_resolution_unknown
  '53300', // too_many_connections
  '57014', // query_canceled — what `statement_timeout` raises
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now, e.g. a replica still recovering
]);

/**
 * `pg` raises these with no code at all, so the message is the only signal. Matched as substrings
 * because the pool decorates them.
 */
const UNAVAILABLE_MESSAGES = [
  'connection terminated',
  'timeout exceeded when trying to connect',
  'query read timeout',
  'connection ended unexpectedly',
  'client has encountered a connection error',
  'terminating connection due to administrator command',
  'the database system is starting up',
  'the database system is shutting down',
];

function causes(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current = error;
  // Bounded rather than `while (current)`: a driver that produces a self-referential cause must not
  // turn error reporting into the next outage.
  for (let depth = 0; depth < 8 && current; depth += 1) {
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

/** True when the throw is the database being unreachable or overloaded, not a defect in a query. */
export function isDatabaseUnavailableError(error: unknown): boolean {
  return causes(error).some((link) => {
    if (typeof link !== 'object' || link === null) return false;
    const { code, message } = link as { code?: unknown; message?: unknown };

    if (typeof code === 'string' && (TRANSPORT_CODES.has(code) || UNAVAILABLE_SQLSTATES.has(code))) {
      return true;
    }
    if (typeof message !== 'string') return false;
    const lowered = message.toLowerCase();
    return UNAVAILABLE_MESSAGES.some((needle) => lowered.includes(needle));
  });
}
