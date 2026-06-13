import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppIcon } from "./index";

describe("AppIcon", () => {
  it("falls back to the InspectIcon svg when no iconUrl is provided", () => {
    const { container } = render(<AppIcon />);

    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders an image when iconUrl is provided", () => {
    const { container } = render(<AppIcon iconUrl="/logo.png" alt="My logo" />);

    const img = screen.getByAltText("My logo");
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe("IMG");
    expect(img).toHaveAttribute("src", "/logo.png");
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("renders the image without an alt attribute value when alt is omitted", () => {
    render(<AppIcon iconUrl="/logo.png" />);

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "/logo.png");
    expect(img).not.toHaveAttribute("alt");
  });

  it("applies the className to the image branch", () => {
    render(<AppIcon iconUrl="/logo.png" alt="Logo" className="size-6 rounded" />);

    expect(screen.getByAltText("Logo")).toHaveClass("size-6", "rounded");
  });

  it("applies the className to the fallback icon branch", () => {
    const { container } = render(<AppIcon className="text-primary size-8" />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("size-8", "text-primary");
  });
});
