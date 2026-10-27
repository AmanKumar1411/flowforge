# ADR 001: Google Sign-In restricted to the university domain

**Status:** Accepted (Phase 3)

## Context

Phases 1 and 2 used email and password. Registration accepted any address on the university
domain and took the **role from the request body**, so anyone could register as `FACULTY`.
FlowForge would also have to store password hashes, handle resets and defend against credential
stuffing. Every student and staff member already has a Google Workspace account on
`nst.rishihood.edu.in`, which the university manages (MFA, offboarding, recovery).

## Decision

- Sign-in is Google only, using the server-side OAuth 2.0 authorization code flow with PKCE,
  `state` and `nonce`. There are no passwords and no `passwordHash` column.
- `GET /api/auth/google` stores `state`, `nonce` and the PKCE verifier in a 10-minute, signed,
  httpOnly cookie and redirects to Google with `scope=openid email profile` and
  `hd=nst.rishihood.edu.in`.
- `GET /api/auth/google/callback` checks `state` against the cookie (constant-time compare),
  exchanges the code with the verifier, and verifies the ID token with `google-auth-library`
  (signature, `iss`, `aud`, `exp`), then checks the `nonce`.
- The application then requires `email_verified === true` and `hd === ALLOWED_HOSTED_DOMAIN`.
  The `hd` URL parameter is only a hint to Google's account chooser; the `hd` **claim** is what
  is enforced.
- Google sits behind the `IdentityProvider` port (`authorizationUrl()`, `verifyCallback()`), so
  `AuthService` and `SignInService` never import Google code.
- After sign-in the browser is redirected to `FRONTEND_URL/auth/callback`. Tokens never appear in
  a URL. The frontend calls `POST /api/auth/refresh` to get its first access token.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep passwords, fix the role bug | Still stores secrets, needs reset flows, and does not prove the person owns a university account |
| Google implicit flow / ID token in the browser | Tokens in the URL fragment and browser history; no client secret; no PKCE |
| Generic SAML/OIDC broker (Keycloak, Auth0) | Another service to run and explain; one IdP does not need it. The port keeps this open |
| Magic-link email | Needs an email service and still trusts mailbox access without MFA |

## Consequences

- FlowForge stores no passwords. Account security, MFA and offboarding are the university's.
- A manual step is needed: create an OAuth client in Google Cloud (see the README).
- The callback is a browser navigation, so errors are reported by redirecting to
  `/login?error=CODE`, not as JSON.
- Tests cannot use real Google. Integration tests fake Google's two network calls
  (`GoogleOAuthClient`); unit tests verify real RS256 tokens with local keys. See ADR 006 for dev
  login.
- The OAuth state cookie is `SameSite=Lax` (it must survive the redirect back from Google); the
  refresh cookie stays `Strict` (ADR 004).
