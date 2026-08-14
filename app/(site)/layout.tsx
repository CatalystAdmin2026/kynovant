import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  metadataBase: new URL("https://catalystcoachingelite.com"),
  applicationName: "Catalyst Coaching Elite",
  title: {
    default: "Catalyst Coaching Elite",
    template: "%s | Catalyst Coaching Elite",
  },
  description:
    "One-on-one physique coaching, accountability, and performance-focused programming.",
  manifest: null,
  icons: {
    icon: [{ url: "/logos/mark-gold.png", type: "image/png" }],
    shortcut: "/logos/mark-gold.png",
    apple: "/logos/mark-gold.png",
  },
  appleWebApp: {
    capable: false,
    title: "Catalyst Coaching Elite",
  },
  openGraph: {
    title: "Catalyst Coaching Elite",
    description:
      "One-on-one physique coaching, accountability, and performance-focused programming.",
    url: "https://catalystcoachingelite.com",
    siteName: "Catalyst Coaching Elite",
    type: "website",
  },
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
      <Footer />
    </>
  );
}
