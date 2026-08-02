import Link from "next/link";

// ─────────────────────────────────────────────────────────────
// Kynovant Admin — Growth Section Nav
//
// A real navigation surface, not just an unlinked route — but
// deliberately minimal. "Applications" is the only entry today;
// this is where future Growth CRM sections (docs/catalyst-os-growth-crm.md,
// not yet built) would be added, not a place to build them now.
//
// This nav only renders inside app/admin/growth/layout.tsx, which is
// itself gated by requireAdminPage() — the link existing is not what
// keeps a coach out; the guard is. See lib/auth/guards.ts.
// ─────────────────────────────────────────────────────────────

export default function AdminGrowthNav() {
  return (
    <header className="border-b border-white/[0.06] bg-[#0b0c0d]">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-6">
        <div className="flex flex-col leading-tight">
          <p className="text-[8px] font-bold tracking-[0.4em] text-white/40 uppercase">
            Kynovant
          </p>
          <p className="text-[10px] font-bold tracking-[0.3em] text-[#C9A24D]/80 uppercase">
            Admin — Growth
          </p>
        </div>

        <nav className="flex items-center gap-1">
          <Link
            href="/admin/growth/applications"
            className="px-3 py-1.5 text-xs font-medium tracking-wide text-white/70 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            Applications
          </Link>
        </nav>
      </div>
    </header>
  );
}
