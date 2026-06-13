import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CodeBlock, CodeBlockCopyButton } from "./code-block";

const SAMPLE = `const a = 1;\nconst b = 2;`;

// `userEvent.setup()` installs its own `navigator.clipboard` stub, clobbering
// anything assigned earlier. To keep our spy in place at click time we install
// it *after* the per-test `userEvent.setup()` call via this helper.
const stubClipboard = (value: unknown) => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value,
  });
};

describe("CodeBlock", () => {
  it("renders the code verbatim", () => {
    render(<CodeBlock code={SAMPLE} />);
    // The full source is present in the rendered output.
    expect(screen.getByText(/const a = 1;/)).toBeInTheDocument();
  });

  it("shows the language label and exposes data-language", () => {
    const { container } = render(<CodeBlock code={SAMPLE} language="ts" />);
    expect(screen.getByText("ts")).toBeInTheDocument();
    // The outer container and the <code> element both carry the language.
    expect(container.firstChild).toHaveAttribute("data-language", "ts");
    expect(container.querySelector("code")).toHaveClass("language-ts");
  });

  it("falls back to a 'text' label when no language is given", () => {
    render(<CodeBlock code={SAMPLE} />);
    expect(screen.getByText("text")).toBeInTheDocument();
  });

  it("renders a line-number gutter when showLineNumbers is set", () => {
    render(<CodeBlock code={SAMPLE} showLineNumbers />);
    // Two visible lines -> gutter shows 1 and 2.
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("does not render a gutter without showLineNumbers", () => {
    render(<CodeBlock code={SAMPLE} />);
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("merges a custom className onto the container", () => {
    const { container } = render(<CodeBlock code={SAMPLE} className="custom-class" />);
    expect(container.firstChild).toHaveClass("custom-class");
    expect(container.firstChild).toHaveClass("bg-card");
  });

  it("renders slotted children (e.g. the copy button) in the header", () => {
    render(
      <CodeBlock code={SAMPLE} language="ts">
        <CodeBlockCopyButton />
      </CodeBlock>
    );
    expect(screen.getByRole("button", { name: "Copy code" })).toBeInTheDocument();
  });
});

describe("CodeBlockCopyButton", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
  });

  it("copies the surrounding block's code via navigator.clipboard", async () => {
    const user = userEvent.setup();
    stubClipboard({ writeText });
    const onCopy = vi.fn();
    render(
      <CodeBlock code={SAMPLE}>
        <CodeBlockCopyButton onCopy={onCopy} />
      </CodeBlock>
    );

    await user.click(screen.getByRole("button", { name: "Copy code" }));

    expect(writeText).toHaveBeenCalledWith(SAMPLE);
    expect(onCopy).toHaveBeenCalledWith(SAMPLE);
  });

  it("shows transient success feedback after copying", async () => {
    const user = userEvent.setup();
    stubClipboard({ writeText });
    render(
      <CodeBlock code={SAMPLE}>
        <CodeBlockCopyButton />
      </CodeBlock>
    );

    const button = screen.getByRole("button", { name: "Copy code" });
    expect(button).toHaveAttribute("data-copied", "false");

    await user.click(button);

    // After a successful copy the button flips to its "copied" state.
    expect(screen.getByRole("button", { name: "Copied" })).toHaveAttribute("data-copied", "true");
  });

  it("reverts to the idle state after the timeout elapses", async () => {
    // `userEvent` + fake timers deadlocks under this jsdom/React 19 setup (the
    // awaited click never resolves), so we drive a synchronous `fireEvent.click`
    // and wait on real timers. `timeoutMs` is kept short and within `waitFor`'s
    // default window so the revert is observed without faking the clock.
    stubClipboard({ writeText });
    render(
      <CodeBlock code={SAMPLE}>
        <CodeBlockCopyButton timeoutMs={50} />
      </CodeBlock>
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    // The copy is async; the success state appears once `writeText` resolves.
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();

    // After `timeoutMs` the button reverts to its idle "Copy code" label.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copy code" })).toBeInTheDocument()
    );
  });

  it("invokes onError when the Clipboard API is unavailable", async () => {
    const user = userEvent.setup();
    // Wipe the clipboard *after* setup so userEvent's stub doesn't reinstate it.
    stubClipboard(undefined);
    const onError = vi.fn();
    const onCopy = vi.fn();
    render(
      <CodeBlock code={SAMPLE}>
        <CodeBlockCopyButton onCopy={onCopy} onError={onError} />
      </CodeBlock>
    );

    await user.click(screen.getByRole("button", { name: "Copy code" }));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onCopy).not.toHaveBeenCalled();
  });

  it("invokes onError when the clipboard write rejects", async () => {
    const rejection = new Error("denied");
    writeText.mockRejectedValueOnce(rejection);
    const user = userEvent.setup();
    stubClipboard({ writeText });
    const onError = vi.fn();
    render(
      <CodeBlock code={SAMPLE}>
        <CodeBlockCopyButton onError={onError} />
      </CodeBlock>
    );

    await user.click(screen.getByRole("button", { name: "Copy code" }));

    expect(onError).toHaveBeenCalledWith(rejection);
  });

  it("renders custom children instead of the default icon", () => {
    render(
      <CodeBlock code={SAMPLE}>
        <CodeBlockCopyButton>Copy</CodeBlockCopyButton>
      </CodeBlock>
    );
    expect(screen.getByRole("button", { name: "Copy code" })).toHaveTextContent("Copy");
  });
});
