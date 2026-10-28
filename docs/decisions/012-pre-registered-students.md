# ADR 012: Faculty can pre-register students; their first sign-in claims the account

**Status:** Accepted (Phase 6). Narrows [ADR 003](003-identify-users-by-google-sub.md).

## Context

FlowForge only knew a student after their first sign-in. A core course's roster was "every
signed-in student of the batch", so students who had not signed in were invisible: leaders could
not find them, and the faculty could neither see nor place them. Electives listed such students,
but they could not be placed either. The team decided that the faculty may import a core batch's
list.

## Decision

- `User.googleSub` becomes nullable. A **pre-registered** student has no sub, no last login,
  role `STUDENT` and the batch from their email. Their name is derived from the email
  ("aarav.s23csai" → "Aarav S") until Google provides the real one.
- `StudentPreRegistration` (auth module) owns the rules: the same student-email and batch-year
  checks as sign-in, one account per email, and the audit trail (`USER_CREATED` and
  `ROLE_ASSIGNED`, reason `PRE_REGISTERED`, with the faculty member as actor).
- Two imports use it:
  - `POST /course-cycles/:id/batch-students` (core cycles, owning faculty) registers students of
    the cycle's batch; other batches, staff and unknown emails are reported per row.
  - Elective enrollment registers every enrolled student who has no account; enrolling an older
    enrollment again registers it too.
- **Claiming:** at sign-in, when no user has the incoming sub, `SignInService` looks for a user with
  the email **and no sub**. If the role resolves (not deactivated), it sets the sub with a
  conditional update (`WHERE googleSub IS NULL`), audits `USER_CLAIMED`, and continues as an
  ordinary login. A user who already has a sub is never re-linked: a second account with the same
  email is still `IDENTITY_CONFLICT`.
- Pre-registered students are ordinary active students for every other rule: they appear in rosters,
  search (`signedIn: false`) and the faculty's "students without a team", and can be placed.

## Alternatives considered

| Option | Why not |
| --- | --- |
| A separate "invited student" table joined into every query | Every roster, search and team rule would need a second kind of person |
| Placeholder sub such as `pending|<email>` | A fake identity in the identity column; null says "no identity yet" honestly |
| Link any new sub to an existing email (reverse ADR 003) | Re-opens the takeover risk for accounts that already have an owner |
| Let admins only import | Faculty know their course lists; the import is limited to their own cycle's batch |

## Consequences

- ADR 003's takeover argument still holds for every account that has signed in. For an account that
  never did, the faculty vouched for the email, and whoever controls that university address first
  becomes its owner, which is the intended person.
- A wrong row in an import creates a real (unused) account; admins can deactivate it, and a
  deactivated pre-registered account cannot be claimed.
- Dev login claims the same way (sub `dev|<email>`), so demo accounts and pre-registered students
  behave alike.
