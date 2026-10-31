# ADR 024: Several processes, fewer queries, and outages that do not sign anyone out

**Status:** Accepted (Phase 10)

## Context

The QA load test (BUG-9) found that one API process tops out at about 650 requests/s on a laptop
core, while 3,000 users at a deadline need about 1,500. The database was mostly idle:

- 17% of the CPU went to re-parsing the JWT secret on every request;
- 42% went to Prisma and the driver, at about 9 queries per request;
- the faculty lists read every version of every team.

Node's 5-second keep-alive dropped POSTs (BUG-10), and a short database outage signed everyone out
(BUG-8).

## Decision

1. **`npm start` runs `src/cluster.ts`.**
   - `API_WORKERS` processes, one per CPU by default, share the port.
   - The primary checks the configuration first: boot is refused when `API_WORKERS × DB_POOL_MAX` exceeds `DB_MAX_CONNECTIONS − DB_CONNECTION_HEADROOM`.
   - The primary replaces a worker that dies, but gives up after three workers in a row die before they listen.
   - On SIGTERM the workers finish their requests (Nest shutdown hooks).
   - `npm run start:single` runs one process.
2. **The JWT key** is a `KeyObject` built once.
3. **Per-request memo (`RequestScope`, `AsyncLocalStorage`):**
   - a cycle with its milestones, a team, and a cycle's teams are read once per request, whichever modules ask;
   - nothing outlives the request, reads inside a transaction bypass it, and the repositories forget their keys on every write;
   - it is not a cache shared between users.
4. **Lighter reads:**
   - the faculty submissions list and grading read only the latest version per team, in one `DISTINCT ON` statement, plus a version count;
   - a team's history is a paged endpoint (`?limit&before`), loaded only when the faculty open it;
   - submissions read only a summary of the team's idea, and create a version with one `INSERT … RETURNING`.

   Budgets in `test/query-budget.e2e.ts` keep the counts.
5. **Timeouts and outages:**
   - `keepAliveTimeout` is 65 s (above a proxy's 60 s), and `headersTimeout` is 66 s.
   - Connection-level database errors become `503 SERVICE_UNAVAILABLE`, with no details; PostgreSQL's invalid-text error becomes `400 INVALID_TEXT`.
   - Refresh clears its cookie only for an answer about the session.
   - The web app retries a refresh or `/auth/me` with backoff while showing "Can't reach FlowForge. Retrying…"; only a 401 means signed out.
6. **Request bodies** nested deeper than `MAX_BODY_DEPTH` (32) are refused before validation, by an iterative check.

## Trade-offs

- **Workers share nothing in memory.** Everything that must be shared (rate limits) is in PostgreSQL, and the memo is per request by design.
- **Connections multiply with the workers.** Each worker has its own pool, which the boot check keeps within the server's limit. The pool waits at most 5 s for a connection before the request fails with 503.
- **The memo hands one object to several readers in a request.** Nothing mutates a loaded cycle or team; a repository forgets on write, so a request that writes and then reads sees its write.
