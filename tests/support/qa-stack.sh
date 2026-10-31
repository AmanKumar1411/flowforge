#!/usr/bin/env bash
# Starts or stops the isolated QA stack. It never touches the dev database (5432) or flowforge_test.
#   tests/support/qa-stack.sh up      DB container (5433), migrations, API build on :3200, web build on :5300
#   tests/support/qa-stack.sh down    stops the API and the web server (the DB container keeps its data)
#   tests/support/qa-stack.sh destroy also removes the DB container
# Secrets for the QA stack are generated once into $QA_ENV_FILE (default tests/.qa/qa.env, git-ignored) and
# never printed. Variables: QA_LOAD=1 raises the auth rate limits (load runs only); SKIP_BUILD=1 reuses builds;
# API_WORKERS (default 4) and DB_POOL_MAX (default 10) size the API cluster; API_ENV adds variables.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
QA="$ROOT/tests/.qa"
mkdir -p "$QA"
QA_ENV_FILE="${QA_ENV_FILE:-$QA/qa.env}"
API_PORT=3200
WEB_PORT=5300
DB_PORT=5433

if [ ! -f "$QA_ENV_FILE" ]; then
  (umask 077; {
    echo "QA_DB_PASSWORD=$(openssl rand -hex 16)"
    echo "QA_JWT_SECRET=$(openssl rand -hex 32)"
    echo "QA_COOKIE_SECRET=$(openssl rand -hex 32)"
  } > "$QA_ENV_FILE")
fi
set -a; . "$QA_ENV_FILE"; set +a
export QA_DATABASE_URL="postgresql://qa:${QA_DB_PASSWORD}@localhost:${DB_PORT}/flowforge_qa"

stop_port() {
  local pid; pid="$(lsof -ti "tcp:$1" -sTCP:LISTEN || true)"
  if [ -n "$pid" ]; then kill $pid; fi
}

db_up() {
  if ! docker ps --format '{{.Names}}' | grep -qx flowforge-qa-db; then
    if docker ps -a --format '{{.Names}}' | grep -qx flowforge-qa-db; then
      docker start flowforge-qa-db > /dev/null
    else
      docker run -d --name flowforge-qa-db -p "$DB_PORT:5432" -e POSTGRES_USER=qa \
        -e POSTGRES_PASSWORD="$QA_DB_PASSWORD" -e POSTGRES_DB=flowforge_qa --memory=2g postgres:18 \
        -c shared_preload_libraries=pg_stat_statements -c pg_stat_statements.track=all \
        -c max_connections=200 -c shared_buffers=256MB > /dev/null
    fi
  fi
  for _ in $(seq 1 30); do
    docker exec flowforge-qa-db pg_isready -U qa -d flowforge_qa > /dev/null 2>&1 && break
    sleep 1
  done
  docker exec flowforge-qa-db psql -q -U qa -d flowforge_qa -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements" > /dev/null
  (cd "$ROOT/backend" && DATABASE_URL="$QA_DATABASE_URL" npx prisma migrate deploy > "$QA/migrate.log" 2>&1)
}

api_up() {
  stop_port "$API_PORT"
  if [ "${SKIP_BUILD:-0}" != 1 ]; then (cd "$ROOT/backend" && npm run build > "$QA/api-build.log" 2>&1); fi
  local limit=10 refresh=30
  if [ "${QA_LOAD:-0}" = 1 ]; then limit=10000; refresh=10000; fi
  (cd "$ROOT/backend" && NODE_ENV=test PORT=$API_PORT DATABASE_URL="$QA_DATABASE_URL" \
    FRONTEND_URL="http://localhost:$WEB_PORT" GOOGLE_REDIRECT_URI="http://localhost:$API_PORT/api/auth/google/callback" \
    JWT_ACCESS_SECRET="$QA_JWT_SECRET" COOKIE_SECRET="$QA_COOKIE_SECRET" ADMIN_BOOTSTRAP_EMAILS=qa.admin@nst.rishihood.edu.in \
    AUTH_DEV_LOGIN_ENABLED=true AUTH_LOGIN_RATE_LIMIT_PER_MINUTE=$limit AUTH_REFRESH_RATE_LIMIT_PER_MINUTE=$refresh \
    API_WORKERS="${API_WORKERS:-4}" DB_POOL_MAX="${DB_POOL_MAX:-10}" DB_MAX_CONNECTIONS=200 TRUST_PROXY=loopback ${API_ENV:-} \
    nohup node dist/cluster.js > "$QA/api.log" 2>&1 &)
  for _ in $(seq 1 60); do curl -sf "http://localhost:$API_PORT/api/health" > /dev/null && return 0; sleep 1; done
  echo "API did not start; see $QA/api.log" >&2; exit 1
}

web_up() {
  stop_port "$WEB_PORT"
  if [ "${SKIP_BUILD:-0}" != 1 ]; then
    (cd "$ROOT/frontend" && VITE_API_BASE_URL="http://localhost:$API_PORT/api" VITE_DEV_LOGIN=true \
      npx vite build --mode test --outDir "$QA/web" --emptyOutDir > "$QA/web-build.log" 2>&1)
  fi
  (cd "$ROOT/frontend" && nohup npx vite preview --outDir "$QA/web" --port "$WEB_PORT" --strictPort > "$QA/web.log" 2>&1 &)
  for _ in $(seq 1 30); do curl -sf "http://localhost:$WEB_PORT/" > /dev/null && return 0; sleep 1; done
  echo "Web server did not start; see $QA/web.log" >&2; exit 1
}

case "${1:-up}" in
  up) db_up; api_up; web_up; echo "QA stack: web http://localhost:$WEB_PORT  api http://localhost:$API_PORT/api  db localhost:$DB_PORT/flowforge_qa" ;;
  api) api_up ;;
  db) db_up ;;
  down) stop_port "$API_PORT"; stop_port "$WEB_PORT" ;;
  destroy) stop_port "$API_PORT"; stop_port "$WEB_PORT"; docker rm -f flowforge-qa-db > /dev/null ;;
  *) echo "usage: $0 up|api|db|down|destroy" >&2; exit 2 ;;
esac
