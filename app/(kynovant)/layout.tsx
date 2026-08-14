import type { Metadata } from "next";
import KynovantNavbar from "@/components/kynovant/KynovantNavbar";
import KynovantFooter from "@/components/kynovant/KynovantFooter";

// Default metadata for this route group. Individual pages (e.g.
// for-coaches/page.tsx) override this with their own `metadata` export
// where they already have one; Next.js merges child metadata over this.
export const metadata: Metadata = {
  metadataBase: new URL("https://kynovant.com"),
  title: "Kynovant — Coaching Business Software",
  description:
    "The system built for personal trainers and online coaches to run client programming, check-ins, nutrition, and progress.",
  openGraph: {
    title: "Kynovant — Coaching Business Software",
    description:
      "The system built for personal trainers and online coaches to run client programming, check-ins, nutrition, and progress.",
    url: "https://kynovant.com",
    siteName: "Kynovant",
    images: [{ url: "/kynovant_primary.png", width: 1254, height: 1254 }],
    type: "website",
  },
};

export default function KynovantLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <KynovantNavbar />
      {children}
      <KynovantFooter />
    </>
  );
}
