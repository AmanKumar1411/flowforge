# ADR 004: Refresh-token rotation with reuse detection

**Status:** Accepted (Phase 3)

## Context

Access tokens must be short-lived (15 minutes) so a leaked one is useful only briefly. Users should
not sign in every 15 minutes, so a longer-lived credential is needed. That credential must not be
readable by page scripts, must be revocable, and must reveal theft.

## Decision

- **Access token:** HS256 JWT, 15 minutes, claims `{ sub, ver, iss, aud }`. Held in memory by the
  frontend, never in `localStorage`.
- **Refresh token:** 256 random bits in an `httpOnly`, `SameSite=Strict`, `Path=/api/auth` cookie
  (`Secure` in production). Only its SHA-256 hash is stored, in `RefreshToken`, with `familyId`,
  `expiresAt`, `familyExpiresAt`, `revokedAt` and `replacedById`. Both lifetimes are 1 day (see the
  amendment below).
- **Rotation:** `POST /api/auth/refresh` revokes the presented token with a compare-and-set
  (`UPDATE … WHERE id = ? AND revokedAt IS NULL`), issues its successor in the same family and
  links the two with `replacedById`. A successor never outlives `familyExpiresAt`.
- **Reuse detection:** presenting a token that was already **rotated** (revoked *and* has a
  successor) means someone kept a copy. The whole family is revoked, `REFRESH_TOKEN_REUSE_DETECTED`
  is audited, and the caller gets `REFRESH_TOKEN_REUSED`. Losing the compare-and-set race is
  treated the same way. A token revoked by logout or deactivation (no successor) gives
  `TOKEN_REVOKED` without a reuse alarm.
- The revocation and the audit row are committed even though the request fails: the service
  returns the denial from the transaction and throws after the commit.
- `POST /api/auth/refresh`, `/logout` and `/dev-login` require `Origin == FRONTEND_URL`.
  `logout` revokes the current family. `logout-all` revokes every family and increments
  `tokenVersion` (ADR 005).
- **Frontend:** refresh is single-flight. Concurrent 401s share one refresh promise, and the Web
  Locks API serializes refreshes across tabs, which share the cookie. Without this, React
  StrictMode's double effects or two open tabs would trigger reuse detection and log the user out.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Long-lived access token only | Cannot be revoked; theft is invisible |
| Refresh token in `localStorage` | Readable by any injected script |
| Plain refresh token stored as-is | A database leak would hand out live sessions |
| Rotation without families | Cannot tell which descendants to revoke on reuse |
| A grace window for reuse | Hides real theft; single-flight solves the honest race instead |

## Consequences

- `SameSite=Strict` requires the frontend and API to share a **site**. `localhost:5173` and
  `localhost:3000` do. In production use, for example, `app.example.edu` and `api.example.edu`, not
  two unrelated domains.
- Use one host name consistently in development: open `http://localhost:5173`, not
  `http://127.0.0.1:5173`, or the Origin check fails.
- A session lasts at most 1 day, after which the user signs in with Google again.
- An attacker who uses a stolen token *first* gets one rotation, but the victim's next refresh
  ends the family for both, and the event is audited.

## Amendment (2026-10-27): one-day sessions

The plan started with 7-day refresh tokens inside a 30-day family. The team decided a sign-in
should last **one day**: `REFRESH_TOKEN_TTL_DAYS=1` and `REFRESH_FAMILY_MAX_DAYS=1`. Every login
starts a family that ends 24 hours later however active the user is. Access tokens still last
15 minutes and rotate the refresh token, and reuse detection is unchanged. The trade-off is one
Google sign-in per day in exchange for a much shorter window for a stolen refresh token. Both values
remain configuration, so this can change without code changes.
