import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button, buttonVariants } from "./button";

describe("Button", () => {
  it("renders its children as a button element", () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole("button", { name: "Click me" });
    expect(button).toBeInTheDocument();
    expect(button.tagName).toBe("BUTTON");
  });

  it("applies the default variant and size classes", () => {
    render(<Button>Default</Button>);
    const button = screen.getByRole("button", { name: "Default" });
    // default variant=primary, size=default
    expect(button).toHaveClass("bg-accent");
    expect(button).toHaveClass("text-accent-foreground");
    expect(button).toHaveClass("px-4");
    expect(button).toHaveClass("py-2");
  });

  it("applies variant prop classes", () => {
    render(<Button variant="outline">Outline</Button>);
    const button = screen.getByRole("button", { name: "Outline" });
    expect(button).toHaveClass("border");
    expect(button).toHaveClass("border-border");
    expect(button).not.toHaveClass("bg-accent");
  });

  it("applies size prop classes", () => {
    render(<Button size="xs">Tiny</Button>);
    const button = screen.getByRole("button", { name: "Tiny" });
    expect(button).toHaveClass("px-2");
    expect(button).toHaveClass("py-1");
    expect(button).toHaveClass("text-xs");
  });

  it("merges a custom className with the variant classes", () => {
    render(<Button className="custom-class">Custom</Button>);
    const button = screen.getByRole("button", { name: "Custom" });
    expect(button).toHaveClass("custom-class");
    expect(button).toHaveClass("bg-accent");
  });

  it("fires onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Press</Button>);
    await user.click(screen.getByRole("button", { name: "Press" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>
    );
    const button = screen.getByRole("button", { name: "Disabled" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders the child element instead of a button when asChild is set", () => {
    render(
      <Button asChild>
        <a href="https://example.com">Link</a>
      </Button>
    );
    const link = screen.getByRole("link", { name: "Link" });
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "https://example.com");
    // variant classes are forwarded onto the slotted element
    expect(link).toHaveClass("bg-accent");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("forwards a ref to the underlying button element", () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("exposes buttonVariants that compute classes from variant and size", () => {
    const classes = buttonVariants({ variant: "ghost", size: "sm" });
    expect(classes).toContain("text-muted-foreground");
    expect(classes).toContain("px-3");
  });
});
