# ADR 003: Identify users by Google `sub`, not by email

**Status:** Accepted (Phase 3). Narrowed by [ADR 012](012-pre-registered-students.md): an account the faculty
pre-registered, which has no sub yet, is claimed by the first sign-in with its email.

## Context

Google's ID token carries `sub` (a stable, never-reassigned account id) and `email`. Emails can
change (a name correction) and can be reused: when a Workspace account is deleted, the address can
later be given to a different person. Keying users by email would hand the new person the old
person's data and role.

## Decision

- `User.googleSub` is unique and is the lookup key on every login.
- `User.email` stays unique and normalized (trimmed, lower-case). It is refreshed from the token on
  each login, together with `name` and `avatarUrl`. `batchYear` is never refreshed (ADR 002).
- If a new `sub` arrives with an email that already belongs to another user, or a known `sub`
  arrives with an email held by someone else, the login is denied with `IDENTITY_CONFLICT` and
  audited. An administrator resolves it; the system does not guess.
- The role is always re-resolved from the **current** email, so a renamed address is classified
  again.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Email as the key | Reassigned addresses inherit someone else's account and role |
| Link a new `sub` to the existing email automatically | The same takeover risk, triggered silently |
| Store both and match either | Ambiguous on conflict; hides exactly the case that needs a human |

## Consequences

- One FlowForge user is one Google account.
- Dev login (ADR 006) uses `sub = "dev|<email>"`. Signing in with real Google using the same email
  in the same database gives `IDENTITY_CONFLICT`, so keep dev and real accounts in separate
  databases.
- Account merges, if ever needed, are a deliberate admin operation (not built).
