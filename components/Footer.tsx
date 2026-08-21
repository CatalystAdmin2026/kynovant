"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const FOOTER_LINKS = [
  { label: "About", href: "/about" },
  { label: "Coaching", href: "/programs" },
  { label: "Apply", href: "/apply" },
] as const;

function isSuppressedPath(pathname: string): boolean {
  return pathname.startsWith("/mission-entry");
}

export default function Footer() {
  const pathname = usePathname();
  const year = new Date().getFullYear();

  if (isSuppressedPath(pathname)) return null;

  return (
    <footer className="border-t border-white/10 bg-[#080909]">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="mb-10 flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <Link href="/" className="flex flex-col leading-none">
            <span className="text-sm font-semibold uppercase tracking-[0.24em] text-white">
              Kept
            </span>
            <span className="mt-1 text-[9px] uppercase tracking-[0.34em] text-[#C9A24D]">
              Performance
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-white/40 transition-colors hover:text-white/75"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mb-8 h-px w-full bg-white/10" />

        <div className="flex flex-col justify-between gap-5 text-xs leading-relaxed text-white/35 md:flex-row">
          <p className="max-w-xl">
            Kept Performance provides one-on-one coaching built around training, nutrition,
            and accountability. Coaching does not replace medical advice, diagnosis, or
            treatment.
          </p>
          <p className="shrink-0 text-white/25 md:text-right">
            © {year} Kept Performance.
            <br />
            All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
