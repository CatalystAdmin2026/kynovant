import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Barlow_Condensed } from "next/font/google";
import "./globals.css";

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
  title: "Kynovant | Coaching Operations Platform",
  description:
    "Kynovant is a coaching operations platform for managing clients, programs, check-ins, nutrition targets, and progress context.",
  icons: {
    icon: "/kynovant_favicon.png",
    shortcut: "/kynovant_favicon.png",
    apple: "/kynovant_favicon.png",
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${barlowCondensed.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
