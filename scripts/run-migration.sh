#!/usr/bin/env bash
# Applies supabase/migrations/001_initial.sql to your hosted Postgres.
# Requires DATABASE_URL in environment or in project root .env
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Missing DATABASE_URL."
  echo "In Supabase: Project Settings → Database → Connection string → URI (paste password)."
  echo "Put it in .env as: DATABASE_URL=postgresql://..."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found. Install PostgreSQL client (e.g. brew install postgresql@18)."
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/001_initial.sql
echo "Migration applied. Check Table Editor in Supabase."
