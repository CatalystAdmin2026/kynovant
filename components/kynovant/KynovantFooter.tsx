"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

// ─────────────────────────────────────────────────────────────
// Kynovant SaaS — Public Footer
//
// Deliberately does not link to any Catalyst Coaching Elite route.
// See components/kynovant/KynovantNavbar.tsx for the same constraint
// on the nav (and the same suppression rationale — this is also
// re-exported by components/Footer.tsx for app/(site)/layout.tsx,
// which includes chrome-less prototype pages), and
// docs/domain-architecture.md for the domain split.
// ─────────────────────────────────────────────────────────────

function isSuppressedPath(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/hq") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/mission-entry") ||
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname === "/account"
  );
}

const FOOTER_LINKS = [
  { label: "Features", href: "/features" },
  { label: "AI Programming", href: "/#ai-programming" },
  { label: "Pricing", href: "/pricing" },
  { label: "Start Free Trial", href: "/start-trial" },
  { label: "Login", href: "/login" },
] as const;

export default function KynovantFooter() {
  const pathname = usePathname();
  const year = new Date().getFullYear();

  if (isSuppressedPath(pathname)) return null;

  return (
    <footer className="bg-mkt-surface border-t border-mkt-border">
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-10">
          <Link href="/" className="flex items-center gap-2.5 group">
            <Image
              src="/kynovant_horizontal.png"
              alt="Kynovant"
              width={166}
              height={83}
              className="h-6 w-auto opacity-90 group-hover:opacity-100 transition-opacity"
            />
          </Link>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-white/40 hover:text-white/75 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="h-px w-full bg-mkt-border mb-8" />

        <div className="flex flex-col md:flex-row justify-between gap-5 text-xs text-white/35 leading-relaxed">
          <p className="max-w-xl">
            Kynovant is coaching operations software for personal trainers and online coaches:
            client management, AI-assisted program building, check-in review, internal
            scheduling, messaging, documents, billing, and progress context. Kynovant does not
            provide medical advice, diagnoses, or treatment.
          </p>
          <p className="md:text-right shrink-0 text-white/25">
            © {year} Kynovant.
            <br />
            All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
