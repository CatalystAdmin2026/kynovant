import { requireAdminPage } from "@/lib/auth/guards";

// ─────────────────────────────────────────────────────────────
// Kynovant Admin — RD/RDN Credential Review
//
// admin-only. requireAdminPage() here is defense-in-depth — the
// parent app/admin/layout.tsx already gates all of /admin/* the same
// way — matching app/admin/growth/layout.tsx's stated convention:
// "protect every page ... do not rely only on hiding links."
//
// Not nested under app/admin/growth/* — Growth is deliberately scoped
// to the coach-acquisition pipeline (see AdminGrowthNav's own
// comment). Credential review is a different concern: verifying an
// already-onboarded coach's professional licensure, not evaluating a
// prospect. Kept as its own top-level admin section, alongside
// /admin/coaches, /admin/blueprints, /admin/programs.
// ─────────────────────────────────────────────────────────────

export default async function AdminCredentialsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage();

  return (
    <div className="min-h-screen bg-[#080909]">
      <header className="border-b border-white/[0.06] bg-[#0b0c0d]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-6">
          <div className="flex flex-col leading-tight">
            <p className="text-[8px] font-bold tracking-[0.4em] text-white/40 uppercase">Kynovant</p>
            <p className="text-[10px] font-bold tracking-[0.3em] text-[#C9A24D]/80 uppercase">
              Admin — RD/RDN Credentials
            </p>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
