import "server-only";

import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export type OverwatchLoginState =
  | { status: "unauthenticated" }
  | { status: "authorized"; email: string }
  | { status: "forbidden"; email: string | null; reason: "not_admin" | "inactive" | "missing_public_user" };

export async function getOverwatchLoginState(): Promise<OverwatchLoginState> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser();

  if (error || !authUser) return { status: "unauthenticated" };

  const db = getDb();
  const [dbUser] = await db
    .select({
      email: users.email,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);

  if (!dbUser) {
    return {
      status: "forbidden",
      email: authUser.email ?? null,
      reason: "missing_public_user",
    };
  }

  if (dbUser.status === "suspended" || dbUser.status === "archived") {
    return { status: "forbidden", email: dbUser.email, reason: "inactive" };
  }

  if (dbUser.role !== "admin") {
    return { status: "forbidden", email: dbUser.email, reason: "not_admin" };
  }

  return { status: "authorized", email: dbUser.email };
}
