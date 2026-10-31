/**
 * Recognises errors from PostgreSQL and its driver that are not the request's
 * fault, however Prisma and pg wrap them (`cause`, `errors` of an
 * AggregateError, Prisma's `meta`). Used by the error filter only.
 */

// Sockets: the database is down, restarting or out of reach.
const SOCKET_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
]);
// SQLSTATE: class 08 (connection exception), shutting down or starting up, too many connections.
const UNAVAILABLE_SQLSTATES = /^(08\d{3}|57P01|57P02|57P03|53300)$/;
// Prisma: database not reachable, timed out, connection closed, no pooled connection in time.
const UNAVAILABLE_PRISMA_CODES = new Set(["P1001", "P1002", "P1017", "P2024"]);
const UNAVAILABLE_MESSAGES =
  /Connection terminated|timeout exceeded when trying to connect|Client has encountered a connection error|the database system is (shutting down|starting up)|Can't reach database server/i;

/** The error and everything it wraps, without visiting one twice. */
function* chain(error: unknown, seen = new Set<unknown>()): Generator<unknown> {
  if (error === null || error === undefined || seen.has(error)) return;
  seen.add(error);
  yield error;
  if (typeof error !== "object") return;
  const wrapped = error as {
    cause?: unknown;
    errors?: unknown;
    meta?: { driverAdapterError?: unknown; cause?: unknown };
  };
  yield* chain(wrapped.cause, seen);
  yield* chain(wrapped.meta?.driverAdapterError, seen);
  yield* chain(wrapped.meta?.cause, seen);
  if (Array.isArray(wrapped.errors)) {
    for (const inner of wrapped.errors) yield* chain(inner, seen);
  }
}

const codesOf = (error: unknown): string[] => {
  if (typeof error !== "object" || error === null) return [];
  const { code, originalCode } = error as {
    code?: unknown;
    originalCode?: unknown;
  };
  return [code, originalCode].filter(
    (value): value is string => typeof value === "string",
  );
};

/** The database could not be reached or dropped the connection: try again later (503). */
export function isDatabaseUnavailable(error: unknown): boolean {
  for (const link of chain(error)) {
    for (const code of codesOf(link)) {
      if (
        SOCKET_CODES.has(code) ||
        UNAVAILABLE_SQLSTATES.test(code) ||
        UNAVAILABLE_PRISMA_CODES.has(code)
      ) {
        return true;
      }
    }
    if (link instanceof Error && UNAVAILABLE_MESSAGES.test(link.message)) {
      return true;
    }
  }
  return false;
}

/** PostgreSQL refused the text itself (SQLSTATE 22021, e.g. a NUL character): the request's fault (400). */
export function isInvalidText(error: unknown): boolean {
  for (const link of chain(error)) {
    if (codesOf(link).includes("22021")) return true;
  }
  return false;
}
