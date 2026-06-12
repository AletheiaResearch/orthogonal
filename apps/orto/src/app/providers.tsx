"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { SWRConfig } from "swr";

import { PostHogIdentity } from "@/components/posthog-identity";
import { SyntaxHighlightTheme } from "@/components/syntax-highlight-theme";
import { Toaster } from "@/components/ui/sonner";

async function swrFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json();
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <SWRConfig value={{ fetcher: swrFetcher, revalidateOnFocus: true, dedupingInterval: 2000 }}>
        <SessionProvider>
          <PostHogIdentity />
          {children}
          <SyntaxHighlightTheme />
          <Toaster />
        </SessionProvider>
      </SWRConfig>
    </ThemeProvider>
  );
}
