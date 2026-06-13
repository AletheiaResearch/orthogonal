import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Separator } from "./separator";

describe("Separator", () => {
  it("renders a separator element", () => {
    const { container } = render(<Separator />);

    const separator = container.firstElementChild;
    expect(separator).not.toBeNull();
    expect(separator).toBeInTheDocument();
  });

  it("is decorative by default, hiding it from the accessibility tree", () => {
    const { container } = render(<Separator />);

    // Decorative Radix separators render role="none" and aria-hidden, so they
    // are not exposed as a "separator" to assistive tech.
    expect(screen.queryByRole("separator")).toBeNull();
    expect(container.firstElementChild).toHaveAttribute("data-orientation", "horizontal");
  });

  it("exposes a semantic separator role when decorative is false", () => {
    render(<Separator decorative={false} />);

    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("applies horizontal sizing classes by default", () => {
    const { container } = render(<Separator />);

    const separator = container.firstElementChild;
    expect(separator).toHaveAttribute("data-orientation", "horizontal");
    expect(separator).toHaveClass("shrink-0", "bg-border", "h-[1px]", "w-full");
  });

  it("applies vertical sizing classes when orientation is vertical", () => {
    const { container } = render(<Separator orientation="vertical" />);

    const separator = container.firstElementChild;
    expect(separator).toHaveAttribute("data-orientation", "vertical");
    expect(separator).toHaveClass("h-full", "w-[1px]");
    expect(separator).not.toHaveClass("h-[1px]", "w-full");
  });

  it("merges a custom className while keeping base classes", () => {
    const { container } = render(<Separator className="custom-sep my-4" />);

    const separator = container.firstElementChild;
    expect(separator).toHaveClass("custom-sep", "my-4");
    expect(separator).toHaveClass("shrink-0", "bg-border");
  });

  it("spreads arbitrary props such as data and aria attributes onto the root", () => {
    const { container } = render(<Separator data-testid="divider" aria-label="section divider" />);

    const separator = container.firstElementChild;
    expect(separator).toHaveAttribute("data-testid", "divider");
    expect(separator).toHaveAttribute("aria-label", "section divider");
  });

  it("forwards a ref to the underlying root element", () => {
    const ref = { current: null as HTMLDivElement | null };

    render(<Separator ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLElement);
  });
});
