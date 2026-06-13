import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Label } from "./label";

describe("Label", () => {
  it("renders its text content", () => {
    render(<Label>Email address</Label>);

    expect(screen.getByText("Email address")).toBeInTheDocument();
  });

  it("renders as a native label element", () => {
    render(<Label>Username</Label>);

    expect(screen.getByText("Username").tagName).toBe("LABEL");
  });

  it("applies the base variant classes", () => {
    render(<Label>Styled</Label>);

    const label = screen.getByText("Styled");
    expect(label).toHaveClass("text-sm");
    expect(label).toHaveClass("font-medium");
    expect(label).toHaveClass("leading-none");
  });

  it("merges a custom className alongside the base classes", () => {
    render(<Label className="text-destructive">With error</Label>);

    const label = screen.getByText("With error");
    expect(label).toHaveClass("text-destructive");
    expect(label).toHaveClass("font-medium");
  });

  it("associates with a control via htmlFor and focuses it on click", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Label htmlFor="email">Email</Label>
        <input id="email" type="email" />
      </div>
    );

    const input = screen.getByRole("textbox");
    expect(input).not.toHaveFocus();

    await user.click(screen.getByText("Email"));

    expect(input).toHaveFocus();
  });

  it("forwards a ref to the underlying label element", () => {
    const ref = { current: null as HTMLLabelElement | null };
    render(<Label ref={ref}>Ref target</Label>);

    expect(ref.current).toBeInstanceOf(HTMLLabelElement);
    expect(ref.current?.textContent).toBe("Ref target");
  });
});
