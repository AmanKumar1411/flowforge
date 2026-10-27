# FlowForge frontend

React and Vite client. Routes: `/login`, `/auth/callback`, `/pending`, `/student/cycles`,
`/faculty/cycles`, `/admin`; each dashboard is guarded by role.

- Sign-in is Google via the API (`/api/auth/google`). `VITE_DEV_LOGIN=true` adds a dev login form.
- The access token is kept in memory only (`src/api/client.ts`). On a 401 the client refreshes
  once and retries. Refresh is single-flight within a tab and serialized across tabs with the Web
  Locks API, so concurrent requests never present the same refresh token twice.
- Auth state lives in `src/auth/AuthProvider.tsx`. Route guards are in `src/auth/RequireRole.tsx`;
  the API enforces every rule independently.

See the repository README for setup, environment and the API.
