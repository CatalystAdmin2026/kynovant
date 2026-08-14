import { redirect } from "next/navigation";
import { getOverwatchLoginState } from "@/lib/auth/overwatch";
import { isSafeRelativePath } from "@/lib/auth/redirect";
import OverwatchLoginClient from "./OverwatchLoginClient";

export const dynamic = "force-dynamic";

function normalizeNext(next: string | undefined): string {
  if (!next) return "/overwatch";
  if (!isSafeRelativePath(next)) return "/overwatch";
  if (next !== "/overwatch" && !next.startsWith("/overwatch?")) return "/overwatch";
  return next;
}

export default async function OverwatchLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const state = await getOverwatchLoginState();
  const nextPath = normalizeNext(params.next);

  if (state.status === "authorized") {
    redirect(nextPath);
  }

  return (
    <OverwatchLoginClient
      initialError={state.status === "forbidden" ? state.reason : params.error ?? null}
      nextPath={nextPath}
    />
  );
}
