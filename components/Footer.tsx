"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Footer() {
  const pathname = usePathname();
  const year = new Date().getFullYear();

  if (
    pathname === "/admin" ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/mission-entry") ||
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname === "/account"
  )
    return null;

  return (
    <footer className="bg-[#080909] border-t border-white/5">
      <div className="max-w-6xl mx-auto px-6 py-14">
        {/* Top row */}
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
            {[
              { label: "Home", href: "/" },
              { label: "About", href: "/about" },
              { label: "Apply", href: "/apply" },
              { label: "For Coaches", href: "/for-coaches" },
            ].map((link) => (
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

        {/* Gold rule */}
        <div className="h-px w-full bg-[#C9A24D]/12 mb-8" />

        {/* Bottom */}
        <div className="flex flex-col md:flex-row justify-between gap-5 text-xs text-gray-600 leading-relaxed">
          <p className="max-w-xl">
            Kynovant provides physique coaching, custom training
            programming, and nutrition guidance for general wellness. We do not
            provide medical advice, diagnoses, or treatment. Consult a qualified
            healthcare provider before beginning any new exercise or nutrition
            program.
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
