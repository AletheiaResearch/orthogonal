import type { Metadata } from "next";
import { Cormorant, Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

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
  weight: "600",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Orto — Background coding agents",
  description:
    "Hand Orto a task and it opens a pull request — autonomous coding agents working your repo in parallel. Private beta, coming soon.",
  openGraph: {
    title: "Orto — Background coding agents",
    description: "Task in, pull request out. Private beta, coming soon.",
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
