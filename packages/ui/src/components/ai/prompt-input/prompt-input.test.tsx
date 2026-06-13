import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

import {
  PromptInput,
  PromptInputEffort,
  PromptInputModelSelect,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "./index";

/** A controlled host that wires the textarea to local state, like a real consumer. */
function Composer({
  onSubmit = () => {},
  initialValue = "",
  status,
  submitDisabled,
  onSubmitShortcut,
}: {
  onSubmit?: (text: string) => void;
  initialValue?: string;
  status?: "ready" | "streaming";
  submitDisabled?: boolean;
  onSubmitShortcut?: boolean;
}) {
  const [value, setValue] = React.useState(initialValue);
  return (
    <PromptInput onSubmit={onSubmit}>
      <PromptInputTextarea
        value={value}
        onChange={setValue}
        placeholder="Message"
        onSubmitShortcut={onSubmitShortcut}
      />
      <PromptInputToolbar>
        <PromptInputTools>
          <PromptInputModelSelect>
            <span>gpt-x</span>
          </PromptInputModelSelect>
        </PromptInputTools>
        <PromptInputSubmit status={status} disabled={submitDisabled} />
      </PromptInputToolbar>
    </PromptInput>
  );
}

describe("PromptInput", () => {
  it("renders the textarea, toolbar tools, and submit button", () => {
    render(<Composer />);
    expect(screen.getByPlaceholderText("Message")).toBeInTheDocument();
    expect(screen.getByText("gpt-x")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("controlled value updates as the user types", async () => {
    const user = userEvent.setup();
    render(<Composer />);
    const textarea = screen.getByPlaceholderText("Message");
    await user.type(textarea, "hello");
    expect(textarea).toHaveValue("hello");
  });

  it("submits the trimmed text when the Send button is clicked", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Composer onSubmit={onSubmit} initialValue="  build a thing  " />);
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("build a thing");
  });

  it("submits on Enter and does not insert a newline", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Composer onSubmit={onSubmit} />);
    const textarea = screen.getByPlaceholderText("Message");
    await user.type(textarea, "ship it");
    await user.type(textarea, "{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("ship it");
  });

  it("inserts a newline on Shift+Enter without submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Composer onSubmit={onSubmit} />);
    const textarea = screen.getByPlaceholderText("Message");
    await user.type(textarea, "line one{Shift>}{Enter}{/Shift}line two");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("line one\nline two");
  });

  it("does not submit empty or whitespace-only text", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Composer onSubmit={onSubmit} initialValue="   " />);
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not submit on Enter when onSubmitShortcut is false", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Composer onSubmit={onSubmit} onSubmitShortcut={false} />);
    const textarea = screen.getByPlaceholderText("Message");
    await user.type(textarea, "hi{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("hi\n");
  });
});

describe("PromptInputSubmit", () => {
  it("is a submit button labeled Send in the ready state", () => {
    render(<Composer status="ready" />);
    const button = screen.getByRole("button", { name: "Send" });
    expect(button).toHaveAttribute("type", "submit");
  });

  it("becomes a Stop button (type=button) while streaming", () => {
    render(<Composer status="streaming" />);
    const button = screen.getByRole("button", { name: "Stop" });
    expect(button).toHaveAttribute("type", "button");
  });

  it("does not submit while streaming even with text present", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Composer onSubmit={onSubmit} initialValue="text" status="streaming" />);
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("respects the disabled prop", () => {
    render(<Composer submitDisabled />);
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});

describe("PromptInputEffort", () => {
  it("renders the current value", () => {
    render(
      <PromptInputEffort efforts={["low", "medium", "high"]} value="medium" onSelect={() => {}} />
    );
    expect(screen.getByRole("button", { name: /medium/i })).toBeInTheDocument();
  });

  it("cycles to the next effort on click", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <PromptInputEffort efforts={["low", "medium", "high"]} value="medium" onSelect={onSelect} />
    );
    await user.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("high");
  });

  it("wraps from the last effort back to the first", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <PromptInputEffort efforts={["low", "medium", "high"]} value="high" onSelect={onSelect} />
    );
    await user.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("low");
  });

  it("starts at the first effort when the value is unknown", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PromptInputEffort efforts={["low", "high"]} value={undefined} onSelect={onSelect} />);
    await user.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("low");
  });

  it("renders nothing when efforts is empty", () => {
    const { container } = render(
      <PromptInputEffort efforts={[]} value={undefined} onSelect={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("does not cycle when disabled", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <PromptInputEffort efforts={["low", "high"]} value="low" onSelect={onSelect} disabled />
    );
    await user.click(screen.getByRole("button"));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("context guards", () => {
  it("throws when PromptInputTextarea is used outside a PromptInput", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<PromptInputTextarea value="" onChange={() => {}} />)).toThrow(
      /must be used within a <PromptInput>/
    );
    spy.mockRestore();
  });
});
