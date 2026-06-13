import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Sagittaire Display (Blaze Type) — editorial display face for the hero line.
// NOTE: trial build; replace with licensed web fonts before production use.
const sagittaire = localFont({
  src: "./fonts/Sgtt-Display-Trial-Regular.otf",
  variable: "--font-sagittaire",
  weight: "400",
  display: "swap",
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
      className={`${geistSans.variable} ${geistMono.variable} ${sagittaire.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[#101010] text-[#EDEBE6]">{children}</body>
    </html>
  );
}
