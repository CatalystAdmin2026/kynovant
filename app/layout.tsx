import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Barlow_Condensed } from "next/font/google";
import "./globals.css";
import PwaInstallBoot from "@/components/pwa/PwaInstallBoot";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-barlow",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://kynovant.com"),
  applicationName: "Kynovant",
  title: "Kynovant | Coaching Operations Platform",
  description:
    "Kynovant is a coaching operations platform for managing clients, programs, check-ins, nutrition targets, and progress context.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/kynovant_favicon.png", sizes: "1254x1254", type: "image/png" },
      { url: "/icons/kynovant-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/kynovant-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/kynovant_favicon.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Kynovant",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "Kynovant | Coaching Operations Platform",
    description: "Kynovant helps coaches manage clients, programs, check-ins, nutrition targets, and progress context.",
    url: "https://kynovant.com",
    siteName: "Kynovant",
    images: [{ url: "/kynovant_primary.png", width: 1254, height: 1254 }],
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#080909",
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${barlowCondensed.variable} antialiased`}>
        <PwaInstallBoot />
        {children}
      </body>
    </html>
  );
}
