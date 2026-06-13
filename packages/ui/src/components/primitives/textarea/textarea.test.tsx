import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

import { Textarea } from "./index";

describe("Textarea", () => {
  it("renders a textarea element", () => {
    render(<Textarea placeholder="Message" />);
    expect(screen.getByPlaceholderText("Message")).toBeInTheDocument();
  });

  it("merges custom className with the base classes", () => {
    render(<Textarea className="custom-class" placeholder="Styled" />);
    const textarea = screen.getByPlaceholderText("Styled");
    expect(textarea).toHaveClass("custom-class");
    expect(textarea).toHaveClass("rounded-sm");
    expect(textarea).toHaveClass("min-h-[60px]");
  });

  it("forwards the ref to the underlying textarea element", () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} placeholder="Ref" />);
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
    expect(ref.current).toBe(screen.getByPlaceholderText("Ref"));
  });

  it("respects the disabled prop", () => {
    render(<Textarea disabled placeholder="Disabled" />);
    expect(screen.getByPlaceholderText("Disabled")).toBeDisabled();
  });

  it("fires onChange and accepts typed input", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Textarea placeholder="Type here" onChange={handleChange} />);

    const textarea = screen.getByPlaceholderText("Type here");
    await user.type(textarea, "hello world");

    expect(handleChange).toHaveBeenCalled();
    expect(textarea).toHaveValue("hello world");
  });

  it("does not fire onChange when disabled", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Textarea disabled placeholder="No type" onChange={handleChange} />);

    await user.type(screen.getByPlaceholderText("No type"), "hello");

    expect(handleChange).not.toHaveBeenCalled();
  });

  it("passes through arbitrary native props", () => {
    render(<Textarea placeholder="Native" name="bio" rows={5} required aria-label="Biography" />);
    const textarea = screen.getByPlaceholderText("Native");
    expect(textarea).toHaveAttribute("name", "bio");
    expect(textarea).toHaveAttribute("rows", "5");
    expect(textarea).toBeRequired();
    expect(textarea).toHaveAccessibleName("Biography");
  });

  it("renders with an initial value via defaultValue", () => {
    render(<Textarea defaultValue="Prefilled content" />);
    expect(screen.getByDisplayValue("Prefilled content")).toBeInTheDocument();
  });
});
