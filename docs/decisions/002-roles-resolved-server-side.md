# ADR 002: Roles are resolved on the server on every login

**Status:** Accepted (Phase 3)

## Context

Google proves *who* someone is. It does not say whether they are a student, faculty or an admin.
The email shape tells students apart from staff (`aman.k23csai@…` versus `prakriti.p@…`), but not
faculty from other staff: admissions, accounts and lab staff have the same shape as faculty. The
Phase 2 bug showed what happens when the client chooses its own role.

## Decision

Identity comes from Google; authorization comes from FlowForge. The client never sends a role.
`RoleResolver` (pure domain code) applies these rules **in order** on every login:

1. Existing user is `DEACTIVATED` → deny `ACCOUNT_DEACTIVATED`.
2. Student-pattern email → `STUDENT`, always. Nothing below can apply to a student email.
3. Staff-pattern email in `ADMIN_BOOTSTRAP_EMAILS`, or already `ADMIN` → `ADMIN`.
4. Staff-pattern email on the faculty allowlist → `FACULTY`.
5. Any other staff-pattern email → `PENDING_STAFF`, plus one pending faculty access request.
6. Anything else → deny `EMAIL_NOT_ELIGIBLE`.

Safety rules:

- **A student-pattern email can never be elevated.** Every path that grants FACULTY or ADMIN
  calls `RoleResolver.assertCanBeElevated()`: allowlist add, request approval, and the bootstrap
  list at boot. A student email fails with `STUDENT_EMAIL_CANNOT_BE_ELEVATED`, any other non-staff
  email with `INVALID_STAFF_EMAIL`. Refusals are audited as `ELEVATION_DENIED`. A student email in
  `ADMIN_BOOTSTRAP_EMAILS` stops the app at boot, because the database is not available yet to
  audit it.
- The patterns cannot overlap: the student pattern needs exactly two digits, the staff pattern
  allows at most one. A unit test checks a list of samples against both.
- `batchYear` is set once, from the email, when the user is created. Later logins never overwrite
  it, so an admin's correction survives. It must lie in `[BATCH_MIN_YEAR, currentYear + 1]`,
  checked by `BatchYearPolicy` with an injected `Clock`.
- The allowlist is read through the `FacultyDirectory` port. Admin approvals and manual adds
  write it today; the future CSV import writes the same table with `source = CSV_IMPORT`, so
  `RoleResolver` and `SignInService` do not change.
- Removing an allowlist entry demotes a FACULTY user to `PENDING_STAFF` (their request becomes
  `REJECTED`) and increments `tokenVersion`, so their current access token stops working.

RBAC is layer one. Ownership and batch checks stay in `CycleAuthorizationPolicy`. A resource the
caller may not see is reported as `404 CYCLE_NOT_FOUND`, so its existence is not revealed.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Role from Google Workspace groups (Directory API) | Needs domain-wide delegation from university IT; not available for the capstone |
| Infer faculty from the email shape | Wrong for admissions, accounts and lab staff |
| Assign the role once at registration | Role changes and removals would never reach existing accounts |
| Put the role in the JWT | Stale until the token expires (see ADR 005) |

## Consequences

- New staff wait for an admin. The `/pending` page tells them so.
- The first admin must be configured: put a **staff** email in `ADMIN_BOOTSTRAP_EMAILS`.
- An existing admin stays admin even if removed from bootstrap config; deactivate them to revoke.
- A student whose email does not fit the pattern is denied and audited with the email, so the
  coordinator can see it. Adjust `STUDENT_EMAIL_PATTERN` if the university format changes.
- All rules live in one pure class with table-style unit tests, which keeps them easy to explain
  and change.
