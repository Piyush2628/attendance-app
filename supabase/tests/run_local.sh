#!/usr/bin/env bash
# Applies the migration to a throwaway database on a local Postgres and runs the tests.
# Uses the usual PG* env vars (PGHOST, PGPORT, PGUSER) to find the server.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="attendance_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -d "$DB" -q -t -v ON_ERROR_STOP=1 \
  -f tests/local_supabase_stub.sql \
  -f migrations/01_schema.sql \
  -f tests/schema_test.sql 2>&1 | grep -E 'ok -|FAILED|ERROR|ALL TESTS'
