# ADR 023: Limits and sessions for a campus behind one IP

**Status:** Accepted (Phase 10). Replaces the per-IP rate limits of Phase 3, and adds a grace
window to the reuse rule of [ADR 004](004-refresh-token-rotation-and-reuse-detection.md) and a
locality rule to the test login of [ADR 006](006-dev-identity-provider.md).

## Context

About 3,000 students may be active at once at a deadline, most on campus Wi-Fi behind one
public IP. Under the old limits (sign-in 10/min and refresh 30/min, per IP, in each process's
memory), the 11th sign-in on campus in a minute was refused. 3,000 signed-in students refresh
about 200 times a minute from that one IP. Several API processes (ADR 024) would each have
allowed the full limit.

## Decision

1. **Every limit is keyed by what it protects:**

   | Limit | Key | Default | Where |
   | --- | --- | --- | --- |
   | Sign-in (Google start and callback, test login) | client IP | 600/min | `ThrottlerGuard` (`login`) |
   | Google sign-in | Google account (`sub`) | 10/min | `AuthService`, once Google has vouched for the account |
   | Refresh | refresh-token family | 10/min | `SessionService`; never per IP |
   | Submissions | user and milestone | 10/min | `SubmissionService` |
   | Versions | team and milestone | 50 in total, `409 VERSION_LIMIT_REACHED` | `SubmissionRules` |
   | Every other authenticated write | user | 120/min | `WriteRateLimitGuard`, after authentication |

   A limited request is `429 TOO_MANY_REQUESTS`. A limited refresh keeps its cookie.

2. **Shared counters in PostgreSQL:**
   - one `UNLOGGED` table `RateLimitCounter(key, windowStart, count, expiresAt)`, counted with one `INSERT … ON CONFLICT … DO UPDATE … RETURNING`;
   - fixed windows computed from the injected `Clock`, with expired rows swept every minute;
   - a refresh counts inside its own transaction, so a request never needs a second pooled connection.

   No Redis: the database is already there, and these counters add one small write per counted request.

3. **The client IP:**
   - `TRUST_PROXY` (off by default; `loopback`, addresses or CIDRs, or a hop count) is passed to Express;
   - without it, `X-Forwarded-For` is ignored, so a client cannot pick its own IP;
   - `TRUST_PROXY=true` is refused at boot.

4. **Test login (SEC-F2):** works with `NODE_ENV=test`, or `development` when the TCP peer is a loopback address and no forwarding header is present. Any other environment with the flag on refuses to boot.

5. **Refresh reuse grace (SEC-F6):** a token presented again within `REFRESH_REUSE_GRACE_SECONDS` (10) of its rotation, while its family still has a live token, gets a new token in the same family. After the window, reuse still revokes the whole family, as before.

6. **Sign-out (SEC-F5):** unchanged. Sign-out ends the refresh family, and the 15-minute access token runs out on its own. The screen after signing out says to use **Sign out everywhere** on shared computers, which also bumps `tokenVersion`.

## Trade-offs

- **The grace window weakens reuse detection for 10 seconds.** Someone who copies a refresh token and uses it within 10 s of its owner's refresh gets a working session. They need the httpOnly, `SameSite=Strict` cookie, which a script in the page cannot read. Without the window, two tabs that refresh together sign the user out everywhere, and the user sees that every day.
- **Fixed windows allow up to twice the limit across a window boundary.** For limits meant to stop floods, not to meter, that is acceptable.
- **The counters are UNLOGGED.** A database crash forgets them, and they rebuild within a minute.
- **A per-account sign-in limit costs one call to Google per refused attempt.** It can only be checked after Google answers. The per-IP limit runs first.
- **An access token stays valid for up to 15 minutes after a single sign-out.** That is the price of not reading a revocation list on every request.
