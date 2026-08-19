#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Catalyst OS — Run DB/Auth-backed test suites against staging, safely.
#
#   npm run test:staging                # every DB-backed suite
#   npm run test:staging -- <path>      # scope to one file/dir
#
# Does exactly three things, in order, and refuses to continue if any
# step fails:
#   1. Explicitly sources .env.staging.local (never .env.local, which
#      is production in this repo — see vitest.config.ts's comment).
#   2. Runs scripts/assert-staging-db.ts, which positively verifies
#      (by actually connecting) that the loaded DATABASE_URL /
#      NEXT_PUBLIC_SUPABASE_URL resolve to a real, reachable,
#      non-production Supabase project.
#   3. Only then launches vitest, forwarding any extra args so you can
#      scope to a single file: npm run test:staging -- lib/db/__tests__/invite-link-security.test.ts
# ─────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.staging.local ]; then
  echo "✗ .env.staging.local not found — cannot run DB-backed tests." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.staging.local
set +a

npx tsx scripts/assert-staging-db.ts
exec npx vitest run "$@"
