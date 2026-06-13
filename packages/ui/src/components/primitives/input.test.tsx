import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

import { Input } from "./input";

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input placeholder="Email" />);
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
  });

  it("applies the default type and forwards the type prop", () => {
    render(<Input type="password" placeholder="Password" />);
    expect(screen.getByPlaceholderText("Password")).toHaveAttribute("type", "password");
  });

  it("merges custom className with the base classes", () => {
    render(<Input className="custom-class" placeholder="Styled" />);
    const input = screen.getByPlaceholderText("Styled");
    expect(input).toHaveClass("custom-class");
    expect(input).toHaveClass("rounded-sm");
  });

  it("forwards the ref to the underlying input element", () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<Input ref={ref} placeholder="Ref" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current).toBe(screen.getByPlaceholderText("Ref"));
  });

  it("respects the disabled prop", () => {
    render(<Input disabled placeholder="Disabled" />);
    expect(screen.getByPlaceholderText("Disabled")).toBeDisabled();
  });

  it("fires onChange and accepts typed input", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Input placeholder="Type here" onChange={handleChange} />);

    const input = screen.getByPlaceholderText("Type here");
    await user.type(input, "hello");

    expect(handleChange).toHaveBeenCalled();
    expect(input).toHaveValue("hello");
  });

  it("does not fire onChange when disabled", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Input disabled placeholder="No type" onChange={handleChange} />);

    await user.type(screen.getByPlaceholderText("No type"), "hello");

    expect(handleChange).not.toHaveBeenCalled();
  });

  it("passes through arbitrary native props", () => {
    render(<Input placeholder="Native" name="username" required aria-label="Username" />);
    const input = screen.getByPlaceholderText("Native");
    expect(input).toHaveAttribute("name", "username");
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleName("Username");
  });
});
