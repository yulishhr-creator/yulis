#!/usr/bin/env bash
# Applies all supabase/migrations/*.sql in sorted order to your hosted Postgres.
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

shopt -s nullglob
files=(supabase/migrations/*.sql)
if [ "${#files[@]}" -eq 0 ]; then
  echo "No migration files found under supabase/migrations/"
  exit 1
fi

IFS=$'\n' sorted=($(printf '%s\n' "${files[@]}" | sort))
for f in "${sorted[@]}"; do
  echo "Applying $f ..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "All migrations applied. Verify in Supabase Table Editor / SQL."
