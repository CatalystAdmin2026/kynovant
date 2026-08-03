"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const PUBLIC_NAV = [
  { label: "Product", href: "/#product" },
  { label: "Pricing", href: "/pricing" },
  { label: "For Coaches", href: "/for-coaches" },
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

export default function KynovantPublicNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (isSuppressedPath(pathname)) return null;

  const solid = scrolled || menuOpen;

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        solid
          ? "border-b border-white/5 bg-[#080909]/96 shadow-[0_1px_20px_rgba(0,0,0,0.4)] backdrop-blur-md"
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
            className="h-7 w-auto opacity-90 transition-opacity group-hover:opacity-100"
          />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {PUBLIC_NAV.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm tracking-wide text-gray-400 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/coach-apply"
            className="bg-[#C9A24D] px-5 py-2.5 text-sm font-semibold tracking-wide text-black transition-colors hover:bg-[#D4B56A]"
          >
            Request Demo / Apply
          </Link>
          <Link
            href="/login"
            className="border border-white/10 px-4 py-2.5 text-sm font-semibold tracking-wide text-gray-300 transition-colors hover:border-white/25 hover:text-white"
          >
            Login
          </Link>
        </nav>

        <button
          type="button"
          className="flex h-8 w-8 flex-col items-center justify-center gap-[5px] md:hidden"
          onClick={() => setMenuOpen((value) => !value)}
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
        <nav className="flex flex-col gap-1 border-t border-white/5 px-6 pb-5 pt-2">
          {PUBLIC_NAV.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="border-b border-white/5 py-3 text-sm tracking-wide text-gray-300 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/coach-apply"
            onClick={() => setMenuOpen(false)}
            className="mt-3 block bg-[#C9A24D] py-3 text-center text-sm font-semibold tracking-wide text-black transition-colors hover:bg-[#D4B56A]"
          >
            Request Demo / Apply
          </Link>
          <Link
            href="/login"
            onClick={() => setMenuOpen(false)}
            className="block border border-white/10 py-3 text-center text-sm font-semibold tracking-wide text-gray-300 transition-colors hover:border-white/25 hover:text-white"
          >
            Login
          </Link>
        </nav>
      </div>
    </header>
  );
}
