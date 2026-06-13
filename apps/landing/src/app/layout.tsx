import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial display face for the hero line. Swap to e.g. Cormorant (also a
// high-contrast serif) by changing this import + the --font-display var.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument",
  weight: "400",
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
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[#101010] text-[#EDEBE6]">{children}</body>
    </html>
  );
}
