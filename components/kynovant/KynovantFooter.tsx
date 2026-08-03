import Image from "next/image";
import Link from "next/link";

// ─────────────────────────────────────────────────────────────
// Kynovant SaaS — Public Footer
//
// Deliberately does not link to any Catalyst Coaching Elite route.
// See components/kynovant/KynovantNavbar.tsx for the same constraint
// on the nav, and docs/domain-architecture.md for the domain split.
// ─────────────────────────────────────────────────────────────

const FOOTER_LINKS = [
  { label: "Home", href: "/" },
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "For Coaches", href: "/for-coaches" },
  { label: "Login", href: "/login" },
] as const;

export default function KynovantFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#080909] border-t border-white/5">
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

          <nav className="flex items-center gap-6 text-sm">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-gray-600 hover:text-gray-300 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="h-px w-full bg-[#C9A24D]/12 mb-8" />

        <div className="flex flex-col md:flex-row justify-between gap-5 text-xs text-gray-600 leading-relaxed">
          <p className="max-w-xl">
            Kynovant is coaching-business software — client management, program building, and
            check-in review for coaches running their own practice. Kynovant is not a healthcare
            provider and does not offer medical advice.
          </p>
          <p className="md:text-right shrink-0 text-gray-700">
            © {year} Kynovant.
            <br />
            All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
