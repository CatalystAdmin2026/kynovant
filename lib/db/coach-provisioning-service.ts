// ─────────────────────────────────────────────────────────────
// Kynovant — Coach Account Provisioning
//
// SERVER-ONLY — never import from a Client Component.
//
// The single, canonical place a public.users row is granted the
// 'coach' role. Extracted out of app/api/admin/coaches/route.ts so
// the exact same idempotent upsert logic backs both call sites:
//
//   - Admin-invited coach: app/api/admin/coaches/route.ts (POST),
//     behind requireAdmin().
//   - Self-service coach signup: app/api/coach-signup/route.ts,
//     intentionally public/unauthenticated — see that route's header
//     comment for why it's safe to call this from an unauthenticated
//     path.
//
// SECURITY INVARIANT (unchanged from before this extraction): role is
// ALWAYS the hardcoded literal "coach" below — never taken from
// request input, user_metadata, or any caller-supplied value. Both
// call sites already create the Supabase Auth user via
// admin.auth.admin.inviteUserByEmail() before calling this function,
// so `userId` here is always a fresh ID Supabase itself just minted,
// never a client-supplied UUID.
//
// Idempotent by construction (same as the pre-extraction code):
//   - users: ON CONFLICT (id) — the on_auth_user_created trigger may
//     have already inserted a role='client' row for this same fresh
//     auth user (race with the trigger); this promotes it to 'coach'
//     rather than erroring.
//   - coach_profiles: ON CONFLICT (user_id) — safe to call twice for
//     the same userId (e.g. a retried request) without creating a
//     duplicate profile row.
// ─────────────────────────────────────────────────────────────

import "server-only";
import { getDb } from "./client";
import { users, coachProfiles } from "./schema";

export interface ProvisionCoachInput {
  userId: string;
  email: string;
  displayName: string;
}

// Grants 'coach' role + status 'invited' and ensures a coach_profiles
// row exists. Callers are responsible for having already created the
// Supabase Auth user (via inviteUserByEmail) — this function only
// touches public.users / public.coach_profiles.
export async function provisionInvitedCoach(input: ProvisionCoachInput): Promise<void> {
  const db = getDb();
  const normalizedEmail = input.email.trim().toLowerCase();

  await db
    .insert(users)
    .values({
      id: input.userId,
      email: input.email,
      normalizedEmail,
      role: "coach",
      status: "invited",
    })
    .onConflictDoUpdate({
      target: users.id,
      set: { role: "coach" },
    });

  await db
    .insert(coachProfiles)
    .values({ userId: input.userId, displayName: input.displayName })
    .onConflictDoUpdate({
      target: coachProfiles.userId,
      set: { displayName: input.displayName },
    });
}
