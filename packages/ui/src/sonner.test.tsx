import { render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { Toaster } from "./sonner";

beforeAll(() => {
  // next-themes + sonner read prefers-color-scheme, which jsdom does not implement.
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
  // Sonner shares a single global toast store across tests; clear it so an
  // emitted toast from one test does not leak the toaster <ol> into the next.
  toast.dismiss();
});

describe("Toaster", () => {
  it("renders the sonner toaster region", () => {
    render(<Toaster />);

    // Sonner renders an accessible notifications region on mount.
    expect(screen.getByRole("region", { name: /notifications/i })).toBeInTheDocument();
  });

  it("applies the toaster group className to the container", async () => {
    const { container } = render(<Toaster />);

    // The toaster host (<ol data-sonner-toaster>) that carries the className is
    // only mounted once at least one toast is queued.
    toast("hello");

    await waitFor(() => {
      expect(container.querySelector(".toaster")).not.toBeNull();
    });

    const toaster = container.querySelector(".toaster");
    expect(toaster).toHaveClass("group");
  });

  it("forwards arbitrary props through to sonner (position)", async () => {
    const { container } = render(<Toaster position="top-center" />);

    toast("hello");

    // Sonner reflects the requested position via data attributes on its host.
    await waitFor(() => {
      expect(container.querySelector("[data-sonner-toaster]")).not.toBeNull();
    });

    const positioned = container.querySelector("[data-sonner-toaster]");
    expect(positioned).toHaveAttribute("data-y-position", "top");
    expect(positioned).toHaveAttribute("data-x-position", "center");
  });

  it("honors an explicit theme prop over the resolved theme", async () => {
    // Without a ThemeProvider, useTheme() resolves to "system"; an explicit
    // theme prop is spread after that default and must win.
    const { container } = render(<Toaster theme="dark" />);

    toast("hello");

    await waitFor(() => {
      expect(container.querySelector("[data-sonner-toaster]")).not.toBeNull();
    });

    const themed = container.querySelector("[data-sonner-toaster]");
    expect(themed).toHaveAttribute("data-sonner-theme", "dark");
  });
});
