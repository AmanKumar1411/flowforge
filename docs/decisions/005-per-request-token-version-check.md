# ADR 005: Per-request token-version check

**Status:** Accepted (Phase 3)

## Context

A JWT is valid until it expires. If role and batch are inside the token, an admin who demotes a
faculty member or deactivates a user waits up to 15 minutes before it takes effect, and the Phase 2
code trusted those claims for an hour. Course-project data (private evaluations, submissions) makes
that window unacceptable.

## Decision

- The access token carries only `{ sub, ver, iss, aud }`, where `ver` is the user's `tokenVersion`.
- `AccessTokenStrategy` (called by the global `JwtAuthGuard`) verifies the JWT, with the algorithm
  pinned to HS256 and issuer and audience checked, then reads
  `{ id, role, status, tokenVersion, batchYear }` **by primary key on every request**. It rejects:
  - a missing, invalid or foreign token → `401 UNAUTHENTICATED`
  - a deactivated user → `401 ACCOUNT_DEACTIVATED`
  - `ver !== tokenVersion` → `401 TOKEN_REVOKED`
- Role and batch used for authorization come from that read, never from the token.
- `tokenVersion` is incremented by every change to role, status or batch (only
  `UsersService` → `UsersRepository.updateAccess` can make those changes, and it always
  increments), by allowlist removal, and by `logout-all`.

## Trade-off

| | Per-request lookup (chosen) | Claims in the JWT |
| --- | --- | --- |
| Revocation, role change, deactivation | Next request | After expiry (up to 15 min) |
| Cost | One indexed primary-key read per request (sub-millisecond on PostgreSQL) | None |
| Token size and content | Tiny; no personal data | Grows with claims |
| Failure mode | Database down → API down (it is anyway) | Stale authorization |

For a course platform with hundreds of users, one primary-key read per request costs nothing
noticeable. If it ever matters, a short in-process cache keyed by `(id, tokenVersion)`, or Redis
pub/sub invalidation, can be added without changing the token format.

## Alternatives considered

- **Token deny-list:** needs storage and a lookup anyway, and only covers explicit revocations,
  not role changes.
- **Very short tokens (1 minute):** many more refreshes, and still a window.
- **Sessions only (no JWT):** also valid, but the JWT keeps request authentication stateless
  except for this one read, and keeps the refresh cookie confined to `/api/auth`.

## Consequences

- An admin action takes effect immediately. The user's frontend gets `401 TOKEN_REVOKED`, refreshes
  once and continues with the new role. That is how an approved PENDING_STAFF user becomes FACULTY
  without signing in again.
- Every authenticated request costs one database read; this is documented and measured as
  negligible here.
