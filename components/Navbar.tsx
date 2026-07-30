"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // TODO: Replace this client-side sessionStorage flag with server-side Stripe
  // session verification before production.
  const handleExecOnboarding = () => {
    sessionStorage.setItem("catalyst_executive_paid_access", "true");
    router.push("/executive-onboarding");
  };

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

  // These routes use their own chrome — suppress the marketing nav
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
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        solid
          ? "bg-[#080909]/96 backdrop-blur-md border-b border-white/5 shadow-[0_1px_20px_rgba(0,0,0,0.4)]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
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

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          <Link
            href="/about"
            className="text-sm text-gray-400 hover:text-white transition-colors tracking-wide"
          >
            About
          </Link>
          <Link
            href="/programs"
            className="text-sm text-gray-400 hover:text-white transition-colors tracking-wide"
          >
            Programs
          </Link>
          {pathname === "/executive-performance-confirmed" ? (
            <button
              type="button"
              onClick={handleExecOnboarding}
              className="text-sm bg-[#C9A24D] text-black px-6 py-2.5 font-semibold tracking-wide hover:bg-[#D4B56A] transition-colors"
            >
              Complete Onboarding
            </button>
          ) : (
            <Link
              href="/apply"
              className="text-sm bg-[#C9A24D] text-black px-6 py-2.5 font-semibold tracking-wide hover:bg-[#D4B56A] transition-colors"
            >
              Apply
            </Link>
          )}
        </nav>

        {/* Mobile toggle */}
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

      {/* Mobile menu */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ${
          menuOpen ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <nav className="px-6 pb-5 pt-2 flex flex-col gap-1 border-t border-white/5">
          <Link
            href="/about"
            className="text-gray-300 py-3 text-sm tracking-wide border-b border-white/5 hover:text-white transition-colors"
          >
            About
          </Link>
          <Link
            href="/programs"
            className="text-gray-300 py-3 text-sm tracking-wide border-b border-white/5 hover:text-white transition-colors"
          >
            Programs
          </Link>
          <div className="pt-3">
            {pathname === "/executive-performance-confirmed" ? (
              <button
                type="button"
                onClick={handleExecOnboarding}
                className="block w-full bg-[#C9A24D] text-black py-3 text-center font-semibold text-sm tracking-wide hover:bg-[#D4B56A] transition-colors"
              >
                Complete Onboarding
              </button>
            ) : (
              <Link
                href="/apply"
                className="block bg-[#C9A24D] text-black py-3 text-center font-semibold text-sm tracking-wide hover:bg-[#D4B56A] transition-colors"
              >
                Apply for Coaching
              </Link>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
