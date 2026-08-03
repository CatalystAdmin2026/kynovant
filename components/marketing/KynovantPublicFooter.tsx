"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const FOOTER_LINKS = [
  { label: "Product", href: "/#product" },
  { label: "Pricing", href: "/pricing" },
  { label: "For Coaches", href: "/for-coaches" },
  { label: "Request Demo / Apply", href: "/coach-apply" },
  { label: "Login", href: "/login" },
];

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

export default function KynovantPublicFooter() {
  const pathname = usePathname();
  const year = new Date().getFullYear();

  if (isSuppressedPath(pathname)) return null;

  return (
    <footer className="border-t border-white/5 bg-[#080909]">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="mb-10 flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <Link href="/" className="group flex items-center gap-2.5">
            <Image
              src="/kynovant_horizontal.png"
              alt="Kynovant"
              width={166}
              height={83}
              className="h-6 w-auto opacity-90 transition-opacity group-hover:opacity-100"
            />
          </Link>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-gray-600 transition-colors hover:text-gray-300"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mb-8 h-px w-full bg-[#C9A24D]/12" />

        <div className="flex flex-col justify-between gap-5 text-xs leading-relaxed text-gray-600 md:flex-row">
          <p className="max-w-xl">
            Kynovant is a coaching operations platform for coaches managing
            clients, programs, check-ins, nutrition targets, and progress in one
            workspace. Kynovant does not provide medical advice, diagnoses, or
            treatment.
          </p>
          <p className="shrink-0 text-gray-700 md:text-right">
            © {year} Kynovant.
            <br />
            All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
