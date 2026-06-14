import type { Metadata } from "next";
import { Cormorant, Geist, Geist_Mono } from "next/font/google";

import { getServerSideURL } from "@/lib/base-url";

import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial display face for the hero line — high-contrast serif. Swap fonts
// by changing this import + the --font-display var (e.g. licensed Sagittaire
// via next/font/local).
const cormorant = Cormorant({
  variable: "--font-cormorant",
  weight: "500",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getServerSideURL()),
  title: "Orto",
  description: "Build on every axis at once.",
  openGraph: {
    title: "Orto",
    description: "Build on every axis at once.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[#101010] text-[#EDEBE6]">{children}</body>
    </html>
  );
}
