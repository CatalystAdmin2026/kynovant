import { ShieldCheck } from "lucide-react";
import { requireCoachOrAdminPage } from "@/lib/auth/guards";
import { getMyCredential, isExpired } from "@/lib/db/coach-credential-service";
import HQBreadcrumbs from "@/components/hq/HQBreadcrumbs";
import HQPageHeader from "@/components/hq/HQPageHeader";
import CredentialSubmissionForm from "@/components/hq/credentials/CredentialSubmissionForm";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// Kynovant Coach HQ — RD/RDN Credential Submission
//
// Self-service: a coach submits their own RD/RDN license for
// verification here. This page does NOT gate the existing
// calories/protein/carb/fat nutrition-target tools (see
// app/hq/clients/[clientId]/nutrition) — those remain open to every
// coach, unaffected by anything on this page. There is also no
// meal-plan builder to unlock yet — see lib/auth/rd-credential.ts's
// header comment for why this gate is built and tested first.
// ─────────────────────────────────────────────────────────────

export default async function CoachCredentialsPage() {
  const { dbUser } = await requireCoachOrAdminPage();

  const credential = dbUser.role === "coach" ? await getMyCredential(dbUser.id) : null;
  const expired = credential?.status === "approved" && isExpired(credential.expirationDate);

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <HQBreadcrumbs crumbs={[{ label: "Overview", href: "/hq" }, { label: "RD/RDN Verification" }]} />

        <div className="mt-8 mb-8">
          <HQPageHeader
            title="RD/RDN Verification"
            subtitle="Verify your Registered Dietitian / Registered Dietitian Nutritionist credential to unlock future individualized meal-planning tools."
          />
        </div>

        {/* ── Why this exists — the product boundary, stated plainly ── */}
        <div className="mb-10 border border-white/[0.06] bg-[#0d0e0f] p-6 rounded-lg">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-gold mt-0.5 shrink-0" aria-hidden />
            <div className="space-y-3">
              <p className="text-sm text-white/70 leading-relaxed">
                <span className="text-white font-semibold">
                  Setting a client&apos;s daily calorie, protein, carb, and fat targets does not require this.
                </span>{" "}
                Every coach already has full access to that in each client&apos;s Nutrition tab — nothing
                here changes that.
              </p>
              <p className="text-sm text-white/50 leading-relaxed">
                This page is specifically for a future capability — AI-assisted, individualized meal
                plans — that Kynovant will restrict to coaches with a verified RD or RDN credential on
                file. Submit your credential now so it&apos;s reviewed and ready before that feature ships.
              </p>
            </div>
          </div>
        </div>

        {dbUser.role === "admin" ? (
          <div className="border border-dashed border-white/[0.08] px-5 py-10 text-center rounded-lg">
            <p className="text-gray-400 text-sm font-medium">Not applicable to admin accounts</p>
            <p className="text-gray-600 text-xs mt-1">
              Review coach submissions at{" "}
              <a href="/admin/growth/credentials" className="underline underline-offset-2 hover:text-gray-400">
                Admin → Credentials
              </a>
              .
            </p>
          </div>
        ) : (
          <CredentialSubmissionForm credential={credential} isExpired={!!expired} />
        )}
      </div>
    </div>
  );
}
