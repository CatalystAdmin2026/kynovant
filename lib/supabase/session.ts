// ─────────────────────────────────────────────────────────────
// Catalyst OS — Session Helpers
//
// SERVER-ONLY — never import from a Client Component.
//
// All helpers call supabase.auth.getUser() which validates the
// session JWT with the Supabase Auth server on every request.
// This is more secure than getSession() which only reads the
// local cookie without re-validating.
// ─────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createClient } from "./server";
import { getDb } from "@/lib/db/client";
import { users, clientProfiles } from "@/lib/db/schema";
import type { User } from "@supabase/supabase-js";

// Explicit column projection for public.users.
// Drizzle's db.query / db.select() wildcard expands to every schema column —
// if the live DB doesn't have a column yet (schema ahead of migration) it
// crashes with SQLSTATE 42703. Explicit projection is safe regardless.
const USER_COLS = {
  id: users.id,
  email: users.email,
  normalizedEmail: users.normalizedEmail,
  emailVerifiedAt: users.emailVerifiedAt,
  role: users.role,
  status: users.status,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  deletedAt: users.deletedAt,
} as const;

// ── Public types ────────────────────────────────────────────

export interface PublicUser {
  id: string;
  email: string;
  normalizedEmail: string;
  role: "client" | "coach" | "admin";
  status: "invited" | "active" | "suspended" | "archived";
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ClientSession {
  authUser: User;
  dbUser: PublicUser;
}

// ── Helpers ─────────────────────────────────────────────────

// Returns the Supabase auth user, or null if not authenticated.
// Validates the JWT with Supabase Auth on every call.
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Returns the auth user or redirects to /login.
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// Returns both the auth user and public.users record, or redirects.
// Redirects to /login if:
//   - no active session
//   - no public.users record exists yet (trigger may still be propagating)
//   - account is suspended or archived
//
// Does NOT redirect if status is 'invited' — an invited user who has
// authenticated via magic link is treated as a valid session; syncUserToPublic
// in the callback already transitions invited → active.
export async function requireClientUser(): Promise<ClientSession> {
  const authUser = await requireUser();
  const db = getDb();

  const rows = await db
    .select(USER_COLS)
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);

  const dbUser = rows[0];

  if (!dbUser) {
    // public.users row not yet created (trigger propagation delay).
    // Redirect to login with an informative state rather than crashing.
    redirect("/login?error=account_not_ready");
  }

  if (dbUser.status === "suspended" || dbUser.status === "archived") {
    redirect("/login?error=access_denied");
  }

  // NOTE — deliberately NOT enforced here: whether an invited client
  // has actually completed /setup-password (as opposed to reaching
  // the Portal on an already-live session without ever setting a
  // password they know). An `encrypted_password IS NOT NULL` check
  // was tried and DISPROVEN empirically on staging — Supabase sets a
  // real random password hash on every invited user at creation time
  // (before generateLink is even clicked), so that column can never
  // distinguish "user set their own password" from "never touched
  // setup-password." A real fix needs a new, explicit signal (e.g. an
  // onboarding-completed timestamp column written by /setup-password's
  // own submit handler) — out of scope for this pass; see the P0
  // client-invitation-flow report for the full reasoning and the
  // recommended follow-up.

  return { authUser, dbUser };
}

// Returns the client profile for the given user, or null.
// Does not throw — callers decide how to handle a missing profile.
export async function getClientProfile(userId: string) {
  const db = getDb();
  const rows = await db
    .select({
      userId: clientProfiles.userId,
      fullName: clientProfiles.fullName,
      preferredName: clientProfiles.preferredName,
      dateOfBirth: clientProfiles.dateOfBirth,
      phone: clientProfiles.phone,
      address: clientProfiles.address,
      occupation: clientProfiles.occupation,
      emergencyContact: clientProfiles.emergencyContact,
      timezone: clientProfiles.timezone,
      referralSource: clientProfiles.referralSource,
      createdAt: clientProfiles.createdAt,
      updatedAt: clientProfiles.updatedAt,
    })
    .from(clientProfiles)
    .where(eq(clientProfiles.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

// Signs out the current user. Call from a Server Action or Route Handler.
// After calling, redirect to /login.
export async function signOutCurrentUser(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
