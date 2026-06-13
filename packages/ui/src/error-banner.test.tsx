import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ErrorBanner } from "./error-banner";

describe("ErrorBanner", () => {
  it("renders its children", () => {
    render(<ErrorBanner>Something went wrong</ErrorBanner>);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders complex react node children", () => {
    render(
      <ErrorBanner>
        <span data-testid="inner">Failed to save</span>
      </ErrorBanner>
    );

    expect(screen.getByTestId("inner")).toHaveTextContent("Failed to save");
  });

  it("applies the base destructive styling classes", () => {
    render(<ErrorBanner data-testid="banner">Error</ErrorBanner>);

    const banner = screen.getByTestId("banner");
    expect(banner).toHaveClass(
      "rounded-md",
      "border",
      "border-destructive-border",
      "bg-destructive-muted",
      "px-4",
      "py-3",
      "text-sm",
      "text-destructive"
    );
  });

  it("merges a custom className with the base classes", () => {
    render(
      <ErrorBanner data-testid="banner" className="mt-4">
        Error
      </ErrorBanner>
    );

    const banner = screen.getByTestId("banner");
    expect(banner).toHaveClass("mt-4");
    expect(banner).toHaveClass("rounded-md");
  });

  it("forwards arbitrary div props to the underlying element", () => {
    render(
      <ErrorBanner data-testid="banner" id="form-error" role="alert" aria-live="assertive">
        Error
      </ErrorBanner>
    );

    const banner = screen.getByTestId("banner");
    expect(banner).toHaveAttribute("id", "form-error");
    expect(banner).toHaveAttribute("role", "alert");
    expect(banner).toHaveAttribute("aria-live", "assertive");
  });
});
