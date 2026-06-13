import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Message, MessageAvatar, MessageContent } from "./index";

describe("Message", () => {
  it("renders its children", () => {
    render(
      <Message from="assistant">
        <span>turn body</span>
      </Message>
    );
    expect(screen.getByText("turn body")).toBeInTheDocument();
  });

  it("exposes the role through a data-from attribute", () => {
    const { container } = render(<Message from="system">sys</Message>);
    expect(container.firstChild).toHaveAttribute("data-from", "system");
  });

  it("reverses the row layout for user turns", () => {
    const { container } = render(<Message from="user">hi</Message>);
    expect(container.firstChild).toHaveClass("flex-row-reverse");
  });

  it("uses normal row order for assistant turns", () => {
    const { container } = render(<Message from="assistant">hi</Message>);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass("flex-row");
    expect(root).not.toHaveClass("flex-row-reverse");
  });

  it("merges a custom className onto the row container", () => {
    const { container } = render(
      <Message from="assistant" className="custom-row">
        x
      </Message>
    );
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass("custom-row", "flex");
  });

  it("forwards arbitrary HTML attributes to the row", () => {
    render(
      <Message from="assistant" data-testid="row" aria-label="a message">
        x
      </Message>
    );
    const root = screen.getByTestId("row");
    expect(root).toHaveAttribute("aria-label", "a message");
  });
});

describe("MessageContent", () => {
  it("renders its children", () => {
    render(<MessageContent>hello world</MessageContent>);
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("defaults to the contained variant with a bubble background and border", () => {
    render(<MessageContent>body</MessageContent>);
    const el = screen.getByText("body");
    expect(el).toHaveAttribute("data-variant", "contained");
    expect(el).toHaveClass("bg-muted", "border", "rounded-lg");
  });

  it("renders the flat variant without a background or border", () => {
    render(<MessageContent variant="flat">body</MessageContent>);
    const el = screen.getByText("body");
    expect(el).toHaveAttribute("data-variant", "flat");
    expect(el).not.toHaveClass("bg-muted");
    expect(el).not.toHaveClass("border");
  });

  it("merges a custom className", () => {
    render(<MessageContent className="extra-class">body</MessageContent>);
    expect(screen.getByText("body")).toHaveClass("extra-class");
  });
});

describe("MessageAvatar", () => {
  it("renders an image when a src is provided", () => {
    render(<MessageAvatar src="https://example.com/a.png" name="Ada Lovelace" />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/a.png");
    expect(img).toHaveAttribute("alt", "Ada Lovelace");
  });

  it("derives two-letter initials from a full name when there is no src", () => {
    render(<MessageAvatar name="Ada Lovelace" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("derives initials from a single-word name", () => {
    render(<MessageAvatar name="assistant" />);
    expect(screen.getByText("AS")).toBeInTheDocument();
  });

  it("prefers an explicit fallback over derived initials", () => {
    render(<MessageAvatar name="Ada Lovelace" fallback="AI" />);
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.queryByText("AL")).not.toBeInTheDocument();
  });

  it("merges a custom className onto the avatar container", () => {
    const { container } = render(<MessageAvatar name="A" className="ring-2" />);
    expect(container.firstChild).toHaveClass("ring-2", "rounded-full");
  });
});

describe("Message composition", () => {
  it("composes an avatar and content within a single turn", () => {
    render(
      <Message from="assistant">
        <MessageAvatar name="Assistant" />
        <MessageContent>
          <p>How can I help?</p>
        </MessageContent>
      </Message>
    );
    expect(screen.getByText("AS")).toBeInTheDocument();
    expect(screen.getByText("How can I help?")).toBeInTheDocument();
  });
});
