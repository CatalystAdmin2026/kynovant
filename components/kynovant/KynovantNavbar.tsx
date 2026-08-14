"use client";

// Kynovant SaaS public navigation. This chrome is shared by the
// Kynovant marketing routes and the preview "/" route, while authenticated
// product surfaces suppress it and render their own shells.

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { label: "Platform", href: "/#platform" },
  { label: "AI Programming", href: "/#ai-programming" },
  { label: "Pricing", href: "/#pricing" },
] as const;

function isSuppressedPath(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/hq") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/mission-entry") ||
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname === "/account" ||
    pathname === "/account-status"
  );
}

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

  if (isSuppressedPath(pathname)) return null;

  const solid = scrolled || menuOpen;

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        solid
          ? "border-b border-mkt-border bg-mkt-surface/92 shadow-[0_1px_24px_rgba(0,0,0,0.45)] backdrop-blur-md"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="group flex items-center gap-3">
          <Image
            src="/kynovant_horizontal.png"
            alt="Kynovant"
            width={166}
            height={83}
            priority
            className="h-7 w-auto opacity-95 transition-opacity group-hover:opacity-100"
          />
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
            href="/login"
            className="text-sm tracking-wide text-white/55 transition-colors hover:text-white"
          >
            Login
          </Link>
          <Link
            href="/start-trial"
            className="rounded-md bg-white px-5 py-2.5 text-sm font-semibold tracking-wide text-[#0d0f11] transition-colors hover:bg-white/90"
          >
            Start Free Trial
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
          menuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <nav className="flex flex-col gap-1 border-t border-mkt-border px-6 pb-5 pt-2">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="border-b border-mkt-border py-3 text-sm tracking-wide text-white/70 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="border-b border-mkt-border py-3 text-sm tracking-wide text-white/70 transition-colors hover:text-white"
          >
            Login
          </Link>
          <div className="pt-3">
            <Link
              href="/start-trial"
              className="block rounded-md bg-white py-3 text-center text-sm font-semibold tracking-wide text-[#0d0f11] transition-colors hover:bg-white/90"
            >
              Start 14-Day Free Trial
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
