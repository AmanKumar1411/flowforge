# FlowForge

FlowForge is a capstone foundation for an academic project lifecycle. V1 contains identity, authentication, course/project cycles, a PostgreSQL model, and a React client. Teams, project ideas, submissions, evaluations, queues, AI/ML, and infrastructure scaling are not implemented yet.

## Prerequisites

- Node.js 22.12 or newer
- Docker Compose

## Local setup

1. Copy `backend/.env.example` to `backend/.env` and replace the database password and JWT secret with local values. The database password must match `infra/.env`.
2. Copy `infra/.env.example` to `infra/.env` and set the same database password used in `DATABASE_URL`.
3. Copy `frontend/.env.example` to `frontend/.env` if the API is not running at `http://localhost:3000/api`.
4. Start PostgreSQL: `docker compose -f infra/docker-compose.yml up -d`.
5. In `backend/`, run `npm ci`, `npm run prisma:generate`, and `npm run prisma:migrate:deploy`.
6. Start the API with `npm run start:dev` from `backend/`.
7. In `frontend/`, run `npm ci` and `npm run dev`.

For the real integration suite, create a local `flowforge_test` database and run it with a test-only `DATABASE_URL`; never point integration tests at the development database. The command is `DATABASE_URL=<test-url> npm run test:integration` from `backend/`.

Use `npm test`, `npm run lint`, and `npm run build` in each app before committing. Local `.env` files, generated Prisma client output, dependencies, builds, and coverage are ignored by Git.

## Environment variables

| Location        | Key                                                                  | Purpose                                              |
| --------------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| `backend/.env`  | `DATABASE_URL`                                                       | PostgreSQL connection URL                            |
| `backend/.env`  | `JWT_SECRET`                                                         | At least 32-character signing secret                 |
| `backend/.env`  | `ALLOWED_UNIVERSITY_EMAIL_DOMAINS`                                   | Comma-separated exact university domains             |
| `backend/.env`  | `BATCH_EMAIL_PATTERN`                                                | Anchored local-part regex with named `batch` capture |
| `backend/.env`  | `BATCH_BASE_YEAR`                                                    | Base year used to convert a two-digit token          |
| `backend/.env`  | `CORS_ORIGIN`                                                        | Comma-separated permitted browser origins            |
| `backend/.env`  | `PORT`                                                               | API port                                             |
| `infra/.env`    | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | Local PostgreSQL container configuration             |
| `frontend/.env` | `VITE_API_BASE_URL`                                                  | API URL used by the frontend                         |

## API foundation

All backend routes use the `/api` prefix.

| Method | Path                             | Purpose                                                  |
| ------ | -------------------------------- | -------------------------------------------------------- |
| POST   | `/api/auth/register`             | Create a university account and derive `batchYear` once  |
| POST   | `/api/auth/login`                | Verify password and issue a JWT                          |
| GET    | `/api/auth/me`                   | Verify a bearer JWT and return its public claims         |
| POST   | `/api/course-cycles`             | Faculty owner creates a draft cycle                      |
| GET    | `/api/course-cycles`             | Student lists published cycles for their persisted batch |
| GET    | `/api/course-cycles/my`          | Faculty lists their own cycles in all states             |
| GET    | `/api/course-cycles/:id`         | Read an owned faculty cycle or visible student cycle     |
| PATCH  | `/api/course-cycles/:id`         | Edit fields allowed by the cycle state                   |
| POST   | `/api/course-cycles/:id/publish` | Publish an owned draft cycle                             |
| POST   | `/api/course-cycles/:id/close`   | Close an owned published cycle                           |

Registration normalizes email before exact-domain validation and persistence. A valid university address without a recognized batch token is stored with `batchYear: null`; no batch is guessed.

See [architecture overview](docs/architecture/foundation.md) and the [course cycle architecture](docs/architecture/course-cycles.md) for module boundaries, lifecycle rules, access policy, and test setup.
