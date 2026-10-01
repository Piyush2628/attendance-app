#!/usr/bin/env bash
# Applies every migration to a throwaway database on a local Postgres and runs the tests.
# Uses the usual PG* env vars (PGHOST, PGPORT, PGUSER) to find the server.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="attendance_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
args=(-f tests/local_supabase_stub.sql)
for m in migrations/*.sql; do args+=(-f "$m"); done
args+=(-f tests/schema_test.sql)
psql -d "$DB" -q -t -v ON_ERROR_STOP=1 "${args[@]}" 2>&1 | grep -E 'ok -|FAILED|ERROR|ALL TESTS'
