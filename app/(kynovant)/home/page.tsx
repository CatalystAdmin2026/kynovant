import type { Metadata } from "next";
import KynovantHomeContent from "@/components/kynovant/KynovantHomeContent";

// Served at "/" for the kynovant.com hostname via a rewrite in
// proxy.ts (Next.js route groups can't have two page.tsx at the same
// path, and app/(site)/page.tsx already owns "/" — see
// docs/domain-architecture.md). app/(site)/page.tsx renders the same
// KynovantHomeContent, so every "/" visitor sees identical content
// regardless of which host or route resolved them here.
export const metadata: Metadata = {
  title: "Kynovant — The Operating System for Personal Trainers and Online Coaches",
  description:
    "Kynovant replaces spreadsheets, PDFs, and scattered DMs with one platform for personal trainers and online coaches to manage programming, check-ins, nutrition, scheduling, messaging, and documents.",
};

export default function KynovantHomeRoute() {
  return <KynovantHomeContent />;
}
