import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { syncUserToPublic, getPublicUser } from "@/lib/auth/sync";
import { isSafeRelativePath } from "@/lib/auth/redirect";

function resolveOverwatchNext(next: string | null): string {
  if (!next) return "/overwatch";

  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return "/overwatch";
  }

  if (!isSafeRelativePath(decoded)) return "/overwatch";
  if (decoded === "/overwatch" || decoded.startsWith("/overwatch?")) return decoded;
  return "/overwatch";
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const next = resolveOverwatchNext(url.searchParams.get("next"));
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.redirect(`${origin}/overwatch/login?error=auth_callback_failed&next=${encodeURIComponent(next)}`);
  }

  await syncUserToPublic(authUser);
  const dbUser = await getPublicUser(authUser.id);

  if (!dbUser) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/overwatch/login?error=forbidden`);
  }

  if (dbUser.status === "suspended" || dbUser.status === "archived") {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/overwatch/login?error=inactive`);
  }

  if (dbUser.role !== "admin") {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/overwatch/login?error=forbidden`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
