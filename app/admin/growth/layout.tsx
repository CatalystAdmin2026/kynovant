// ─────────────────────────────────────────────────────────────
// Kynovant Admin — Growth Section Layout
//
// Admin-only, nested more strictly than the parent app/admin/layout.tsx
// (which currently allows coach OR admin, unrelated legacy pages under
// /admin/*). requireAdminPage() is the actual enforcement — nesting
// AdminGrowthNav inside this gate, rather than merely omitting it from
// HQ's own nav, is what makes this "protect every page ... do not rely
// only on hiding links" (see lib/auth/guards.ts).
// ─────────────────────────────────────────────────────────────

import { requireAdminPage } from "@/lib/auth/guards";
import AdminGrowthNav from "@/components/admin/growth/AdminGrowthNav";

export default async function AdminGrowthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage();

  return (
    <div className="min-h-screen bg-[#080909]">
      <AdminGrowthNav />
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
