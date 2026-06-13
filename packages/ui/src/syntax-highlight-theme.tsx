"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

/**
 * How the active syntax-highlight color scheme is chosen: a fixed `light` or
 * `dark`, or `system` to follow the resolved app theme.
 */
export type ColorSchemeMode = "light" | "dark" | "system";

/**
 * A single vendorized highlight.js theme entry. `colorScheme` lets callers
 * filter the registry into light and dark variants; `cssPath` is the href of
 * the stylesheet to load.
 */
export interface SyntaxHighlightThemeDefinition {
  id: string;
  label: string;
  colorScheme: "light" | "dark";
  cssPath: string;
}

const LINK_ID = "hljs-theme-link";

export interface SyntaxHighlightThemeProps {
  /**
   * The user's resolved syntax-highlight preferences. Owned by the host app
   * (e.g. backed by localStorage), this component is purely presentational.
   */
  preferences: {
    colorSchemeMode: ColorSchemeMode;
    preferredLightTheme: string;
    preferredDarkTheme: string;
  };
  /**
   * The full set of available highlight.js themes. Light and dark fallback
   * lists are derived internally by filtering on `colorScheme`.
   */
  themeRegistry: SyntaxHighlightThemeDefinition[];
}

/**
 * Dynamically loads the appropriate highlight.js theme stylesheet based on the
 * supplied preferences. Must be rendered as a single instance (in Providers).
 *
 * It is intentionally decoupled from any storage mechanism: the host app owns
 * `preferences` and the `themeRegistry` (including asset paths), and this
 * component only resolves which stylesheet to inject and keeps a single
 * `<link>` element in sync.
 */
export function SyntaxHighlightTheme({ preferences, themeRegistry }: SyntaxHighlightThemeProps) {
  const { resolvedTheme } = useTheme();
  const { colorSchemeMode, preferredLightTheme, preferredDarkTheme } = preferences;

  useEffect(() => {
    // Derive the light/dark fallback lists from the registry
    const lightThemes = themeRegistry.filter((t) => t.colorScheme === "light");
    const darkThemes = themeRegistry.filter((t) => t.colorScheme === "dark");

    // Determine which color scheme is active
    let activeScheme: "light" | "dark";
    if (colorSchemeMode === "system") {
      activeScheme = (resolvedTheme as "light" | "dark") ?? "light";
    } else {
      activeScheme = colorSchemeMode;
    }

    // Pick the user's preferred theme for that scheme, falling back to first registry entry
    const themeId = activeScheme === "dark" ? preferredDarkTheme : preferredLightTheme;
    const fallbackThemes = activeScheme === "dark" ? darkThemes : lightThemes;
    const themeDef = themeRegistry.find((t) => t.id === themeId) ?? fallbackThemes[0];
    if (!themeDef) return;
    const href = themeDef.cssPath;

    // Reuse a single link element by ID — no duplication, no accumulation
    let link = document.getElementById(LINK_ID) as HTMLLinkElement | null;
    if (link) {
      if (link.getAttribute("href") === href) return;
      link.href = href;
    } else {
      link = document.createElement("link");
      link.id = LINK_ID;
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    }
  }, [resolvedTheme, colorSchemeMode, preferredLightTheme, preferredDarkTheme, themeRegistry]);

  return null;
}
