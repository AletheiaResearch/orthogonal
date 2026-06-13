"use client";

import { SyntaxHighlightTheme, Toaster } from "@orthogonal/ui";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { SWRConfig } from "swr";

import { PostHogIdentity } from "@/components/posthog-identity";
import {
  HLJS_THEME_REGISTRY,
  useSyntaxHighlightPreferences,
} from "@/hooks/use-syntax-highlight-preferences";

async function swrFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json();
}

export function Providers({ children }: { children: React.ReactNode }) {
  const syntaxHighlightPreferences = useSyntaxHighlightPreferences();
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <SWRConfig value={{ fetcher: swrFetcher, revalidateOnFocus: true, dedupingInterval: 2000 }}>
        <SessionProvider>
          <PostHogIdentity />
          {children}
          <SyntaxHighlightTheme
            preferences={syntaxHighlightPreferences}
            themeRegistry={HLJS_THEME_REGISTRY}
          />
          <Toaster />
        </SessionProvider>
      </SWRConfig>
    </ThemeProvider>
  );
}
