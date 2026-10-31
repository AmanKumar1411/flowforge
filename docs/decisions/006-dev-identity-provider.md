# ADR 006: Development identity provider

**Status:** Accepted (Phase 3)

**Note:** Phase 10: the test login answers only with `NODE_ENV=test`, or in development to requests from this machine ([ADR 023](023-campus-limits-and-sessions.md)).

## Context

Real Google accounts make tests slow and flaky, and a live demo needs to show a student, a faculty
member, a pending staff member and an admin in a few minutes. Creating Workspace test accounts is
not possible for the team. A back door into production, however, would undo every other decision
in this phase.

## Decision

- `POST /api/auth/dev-login` with `{ email, name }` produces an `ExternalIdentity`
  (`sub = "dev|<email>"`, `emailVerified = true`, `hostedDomain` = the email's domain) and passes it
  to the **same** `SignInService.signIn()` as Google. Role resolution, batch rules, pending
  requests, the refresh-token family and the audit trail are identical. A Gmail address is still
  refused with `WRONG_HOSTED_DOMAIN`.
- It works only when `AUTH_DEV_LOGIN_ENABLED=true` **and** `NODE_ENV !== "production"`, checked in
  `LocalDevIdentityProvider` on every call. Otherwise it returns `404 DEV_LOGIN_DISABLED`.
- Boot-time guard: `parseEnvironment()` refuses to start when `AUTH_DEV_LOGIN_ENABLED=true` with
  `NODE_ENV=production`. An integration test boots the real app in a child process to prove it.
- Like `/refresh`, it requires `Origin == FRONTEND_URL` and is rate-limited with the login limit.
- The frontend shows the form only when `VITE_DEV_LOGIN=true`. That is cosmetic; the API decides.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Mock Google in tests only | No way to demo several roles quickly, and still no fast local workflow |
| Seeded users with passwords | Reintroduces passwords and a second code path |
| A "fake Google" server | More moving parts for the same result |
| Feature flag without the boot check | One wrong environment variable would open production |

## Consequences

- Integration tests and demos sign in with one request.
- Dev identities have `sub = "dev|…"`. Mixing them with real Google sign-ins for the same email in
  one database gives `IDENTITY_CONFLICT` (ADR 003), so use separate databases.
- `.env.example` ships with `AUTH_DEV_LOGIN_ENABLED=true` for local work; production must set it to
  `false` (the app will not start otherwise).
