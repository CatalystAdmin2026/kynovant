"use client";

// ─────────────────────────────────────────────────────────────
// Kynovant SaaS — Public Navigation
//
// Dedicated to the Kynovant software marketing surface (kynovant.com):
// Features, Pricing, For Coaches, Login. Deliberately does NOT link to
// any Catalyst Coaching Elite route (About, Programs, Apply, Enroll) —
// those are a separate, dormant business served from its own domain.
// See docs/domain-architecture.md.
//
// This is a new, separate component from components/Navbar.tsx (the
// existing Catalyst site nav) — not a variant of it. Catalyst's nav is
// left untouched per the "do not redesign Catalyst" constraint.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "For Coaches", href: "/for-coaches" },
] as const;

export default function KynovantNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setMenuOpen(false), 0);
    return () => clearTimeout(t);
  }, [pathname]);

  const solid = scrolled || menuOpen;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        solid
          ? "bg-[#080909]/96 backdrop-blur-md border-b border-white/5 shadow-[0_1px_20px_rgba(0,0,0,0.4)]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <Image
            src="/kynovant_horizontal.png"
            alt="Kynovant"
            width={166}
            height={83}
            priority
            className="h-7 w-auto opacity-90 group-hover:opacity-100 transition-opacity"
          />
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-gray-400 hover:text-white transition-colors tracking-wide"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="text-sm text-gray-400 hover:text-white transition-colors tracking-wide"
          >
            Login
          </Link>
          <Link
            href="/coach-apply"
            className="text-sm bg-[#C9A24D] text-black px-6 py-2.5 font-semibold tracking-wide hover:bg-[#D4B56A] transition-colors"
          >
            Apply
          </Link>
        </nav>

        <button
          className="md:hidden flex flex-col justify-center items-center w-8 h-8 gap-[5px]"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle navigation"
        >
          <span
            className={`block h-px w-5 bg-white transition-all duration-300 origin-center ${
              menuOpen ? "rotate-45 translate-y-[6px]" : ""
            }`}
          />
          <span
            className={`block h-px w-5 bg-white transition-all duration-300 ${
              menuOpen ? "opacity-0 scale-x-0" : ""
            }`}
          />
          <span
            className={`block h-px w-5 bg-white transition-all duration-300 origin-center ${
              menuOpen ? "-rotate-45 -translate-y-[6px]" : ""
            }`}
          />
        </button>
      </div>

      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ${
          menuOpen ? "max-h-80 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <nav className="px-6 pb-5 pt-2 flex flex-col gap-1 border-t border-white/5">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-gray-300 py-3 text-sm tracking-wide border-b border-white/5 hover:text-white transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="text-gray-300 py-3 text-sm tracking-wide border-b border-white/5 hover:text-white transition-colors"
          >
            Login
          </Link>
          <div className="pt-3">
            <Link
              href="/coach-apply"
              className="block bg-[#C9A24D] text-black py-3 text-center font-semibold text-sm tracking-wide hover:bg-[#D4B56A] transition-colors"
            >
              Apply for Founding Coach Access
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
