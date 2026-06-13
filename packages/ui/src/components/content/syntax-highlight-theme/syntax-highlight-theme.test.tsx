import { render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { SyntaxHighlightTheme, type SyntaxHighlightThemeDefinition } from "./index";

const LINK_ID = "hljs-theme-link";

const REGISTRY: SyntaxHighlightThemeDefinition[] = [
  {
    id: "atom-one-light",
    label: "Atom One Light",
    colorScheme: "light",
    cssPath: "/hljs-themes/atom-one-light.css",
  },
  {
    id: "github",
    label: "GitHub",
    colorScheme: "light",
    cssPath: "/hljs-themes/github.css",
  },
  {
    id: "atom-one-dark",
    label: "Atom One Dark",
    colorScheme: "dark",
    cssPath: "/hljs-themes/atom-one-dark.css",
  },
  {
    id: "github-dark",
    label: "GitHub Dark",
    colorScheme: "dark",
    cssPath: "/hljs-themes/github-dark.css",
  },
];

function link(): HTMLLinkElement | null {
  return document.getElementById(LINK_ID) as HTMLLinkElement | null;
}

beforeAll(() => {
  // next-themes reads prefers-color-scheme via matchMedia, which jsdom omits.
  if (typeof globalThis.matchMedia === "undefined") {
    globalThis.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;
  }
});

afterEach(() => {
  // The component injects a persistent <link> into document.head by id; remove
  // it between tests so each case starts from a clean slate.
  link()?.remove();
});

describe("SyntaxHighlightTheme", () => {
  it("renders nothing into the React tree", () => {
    const { container } = render(
      <SyntaxHighlightTheme
        preferences={{
          colorSchemeMode: "light",
          preferredLightTheme: "github",
          preferredDarkTheme: "github-dark",
        }}
        themeRegistry={REGISTRY}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("injects a single stylesheet link into the document head", () => {
    render(
      <SyntaxHighlightTheme
        preferences={{
          colorSchemeMode: "light",
          preferredLightTheme: "github",
          preferredDarkTheme: "github-dark",
        }}
        themeRegistry={REGISTRY}
      />
    );

    const el = link();
    expect(el).not.toBeNull();
    expect(el?.rel).toBe("stylesheet");
    expect(document.head.contains(el)).toBe(true);
  });

  it("loads the preferred light theme when the mode is light", () => {
    render(
      <SyntaxHighlightTheme
        preferences={{
          colorSchemeMode: "light",
          preferredLightTheme: "github",
          preferredDarkTheme: "github-dark",
        }}
        themeRegistry={REGISTRY}
      />
    );

    expect(link()?.getAttribute("href")).toBe("/hljs-themes/github.css");
  });

  it("loads the preferred dark theme when the mode is dark", () => {
    render(
      <SyntaxHighlightTheme
        preferences={{
          colorSchemeMode: "dark",
          preferredLightTheme: "github",
          preferredDarkTheme: "github-dark",
        }}
        themeRegistry={REGISTRY}
      />
    );

    expect(link()?.getAttribute("href")).toBe("/hljs-themes/github-dark.css");
  });

  it("falls back to the first matching scheme entry for an unknown theme id", () => {
    render(
      <SyntaxHighlightTheme
        preferences={{
          colorSchemeMode: "light",
          preferredLightTheme: "does-not-exist",
          preferredDarkTheme: "github-dark",
        }}
        themeRegistry={REGISTRY}
      />
    );

    // First light entry in the registry is atom-one-light.
    expect(link()?.getAttribute("href")).toBe("/hljs-themes/atom-one-light.css");
  });

  it("reuses the existing link element and updates its href when preferences change", () => {
    const { rerender } = render(
      <SyntaxHighlightTheme
        preferences={{
          colorSchemeMode: "light",
          preferredLightTheme: "github",
          preferredDarkTheme: "github-dark",
        }}
        themeRegistry={REGISTRY}
      />
    );

    const first = link();
    expect(first?.getAttribute("href")).toBe("/hljs-themes/github.css");

    rerender(
      <SyntaxHighlightTheme
        preferences={{
          colorSchemeMode: "light",
          preferredLightTheme: "atom-one-light",
          preferredDarkTheme: "github-dark",
        }}
        themeRegistry={REGISTRY}
      />
    );

    // Same element instance, mutated href — no second <link> is appended.
    expect(document.querySelectorAll(`#${LINK_ID}`)).toHaveLength(1);
    expect(link()).toBe(first);
    expect(link()?.getAttribute("href")).toBe("/hljs-themes/atom-one-light.css");
  });

  it("does not inject anything when the registry has no matching scheme", () => {
    render(
      <SyntaxHighlightTheme
        preferences={{
          colorSchemeMode: "dark",
          preferredLightTheme: "github",
          preferredDarkTheme: "github-dark",
        }}
        // Only light themes available, but dark scheme requested.
        themeRegistry={REGISTRY.filter((t) => t.colorScheme === "light")}
      />
    );

    expect(link()).toBeNull();
  });
});
