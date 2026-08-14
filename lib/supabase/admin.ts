// ─────────────────────────────────────────────────────────────
// Catalyst OS — Supabase Admin (Service Role) Client
//
// SERVER-ONLY — never import from a Client Component, never log
// the returned client or its key, never forward this key to the
// browser under any circumstance.
//
// Uses the Supabase service-role key, which bypasses RLS and can
// perform privileged Auth Admin operations (inviteUserByEmail,
// deleting users, etc). Only call this from trusted, guarded
// server code — every call site must sit behind an explicit role
// guard (requireAdmin / requireCoachOrAdmin) before this module is
// ever reached, with ONE deliberate, reviewed exception: self-service
// coach signup (app/api/coach-signup/route.ts) is intentionally
// public/unauthenticated — that's the whole point of self-service.
// Its safety comes from what it does with this client, not from a
// role guard in front of it: it only ever calls inviteUserByEmail()
// with a server-hardcoded role ("coach", never client input) via
// lib/db/coach-provisioning-service.ts, and it's rate-limited by IP
// and by email (lib/db/coach-signup-service.ts). See that route's
// header comment for the full reasoning.
//
// Currently used for:
//   - Admin inviting a new coach account (app/api/admin/coaches)
//   - Self-service coach signup (app/api/coach-signup) — public,
//     rate-limited, hardcoded role — see above
//   - A coach creating their first client from HQ onboarding
//     (app/api/internal/clients POST)
// ─────────────────────────────────────────────────────────────

import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Thrown when required server env vars are missing. Callers should catch
// this specifically and return a generic, safe message to the HTTP
// response (this message names env vars and a local file — fine for a
// server log or a trusted admin, not for an arbitrary authenticated
// caller, e.g. a plain coach hitting /api/internal/clients from
// HQ onboarding). Never includes any credential value.
export class AdminClientConfigError extends Error {
  constructor() {
    super(
      "SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) is not configured — " +
      "admin invite operations are unavailable. See env.local.example.",
    );
    this.name = "AdminClientConfigError";
  }
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new AdminClientConfigError();
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
