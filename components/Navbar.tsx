"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { label: "About", href: "/about" },
  { label: "Coaching", href: "/programs" },
  { label: "Apply", href: "/apply" },
] as const;

function isSuppressedPath(pathname: string): boolean {
  return pathname.startsWith("/mission-entry");
}

export default function Navbar() {
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

  if (isSuppressedPath(pathname)) return null;

  const solid = scrolled || menuOpen;

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        solid
          ? "border-b border-white/10 bg-[#080909]/92 shadow-[0_1px_24px_rgba(0,0,0,0.45)] backdrop-blur-md"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="group flex flex-col leading-none">
          <span className="text-sm font-semibold uppercase tracking-[0.24em] text-white transition-colors group-hover:text-[#C9A24D]">
            Kept
          </span>
          <span className="mt-1 text-[9px] uppercase tracking-[0.34em] text-[#C9A24D]">
            Performance
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm tracking-wide text-white/55 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/apply"
            className="bg-[#C9A24D] px-5 py-2.5 text-sm font-semibold tracking-wide text-black transition-colors hover:bg-[#D4B56A]"
          >
            Apply for Coaching
          </Link>
        </nav>

        <button
          type="button"
          className="flex h-8 w-8 flex-col items-center justify-center gap-[5px] md:hidden"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
        >
          <span
            className={`block h-px w-5 origin-center bg-white transition-all duration-300 ${
              menuOpen ? "translate-y-[6px] rotate-45" : ""
            }`}
          />
          <span
            className={`block h-px w-5 bg-white transition-all duration-300 ${
              menuOpen ? "scale-x-0 opacity-0" : ""
            }`}
          />
          <span
            className={`block h-px w-5 origin-center bg-white transition-all duration-300 ${
              menuOpen ? "-translate-y-[6px] -rotate-45" : ""
            }`}
          />
        </button>
      </div>

      <div
        className={`overflow-hidden transition-all duration-300 md:hidden ${
          menuOpen ? "max-h-80 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <nav className="flex flex-col gap-1 border-t border-white/10 px-6 pb-5 pt-2">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="border-b border-white/10 py-3 text-sm tracking-wide text-white/70 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-3">
            <Link
              href="/apply"
              className="block bg-[#C9A24D] py-3 text-center text-sm font-semibold tracking-wide text-black transition-colors hover:bg-[#D4B56A]"
            >
              Apply for Coaching
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
