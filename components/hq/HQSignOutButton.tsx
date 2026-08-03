"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  compact?: boolean;
}

export default function HQSignOutButton({ compact = false }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    if (loading) return;
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      aria-label="Sign out"
      className={
        compact
          ? "flex w-full items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35 transition-colors hover:text-white/60 disabled:cursor-wait disabled:opacity-40"
          : "flex h-8 items-center gap-2 border border-white/[0.07] px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45 transition-colors hover:border-white/[0.14] hover:text-white/70 disabled:cursor-wait disabled:opacity-40"
      }
    >
      <LogOut size={compact ? 13 : 12} />
      <span>{loading ? "Signing out..." : "Sign out"}</span>
    </button>
  );
}
