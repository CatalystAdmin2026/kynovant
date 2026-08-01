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
// server code — every call site must sit behind an explicit
// role guard (requireAdmin / requireCoachOrAdmin) before this
// module is ever reached.
//
// Currently used for:
//   - Admin inviting a new coach account (app/admin/coaches)
//   - A coach creating their first client from HQ onboarding
//     (app/api/internal/clients POST)
// ─────────────────────────────────────────────────────────────

import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) is not configured — " +
      "admin invite operations are unavailable. See env.local.example.",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
