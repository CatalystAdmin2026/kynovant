import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  metadataBase: new URL("https://catalystcoachingelite.com"),
  applicationName: "Kept Performance",
  title: {
    default: "Kept Performance",
    template: "%s | Kept Performance",
  },
  description:
    "Precision coaching built around training, nutrition, accountability, and consistent execution. You made the promise. Keep it.",
  manifest: null,
  icons: {
    icon: [{ url: "/logos/mark-gold.png", type: "image/png" }],
    shortcut: "/logos/mark-gold.png",
    apple: "/logos/mark-gold.png",
  },
  appleWebApp: {
    capable: false,
    title: "Kept Performance",
  },
  openGraph: {
    title: "Kept Performance",
    description:
      "Precision coaching built around training, nutrition, accountability, and consistent execution.",
    url: "https://catalystcoachingelite.com",
    siteName: "Kept Performance",
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
