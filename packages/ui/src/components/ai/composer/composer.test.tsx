import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { type SlashCommand } from "../slash-command-popover";
import { Composer } from "./index";

const COMMANDS: SlashCommand[] = [
  { id: "help", trigger: "help", title: "Help", description: "Show available commands" },
  { id: "clear", trigger: "clear", title: "Clear", description: "Clear the conversation" },
  { id: "model", trigger: "model", title: "Model", description: "Switch model" },
  { id: "retry", trigger: "retry", title: "Retry", description: "Re-run the last prompt" },
];

function setup(overrides: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onSubmit = vi.fn();
  const onCommand = vi.fn();
  render(
    <Composer
      commands={COMMANDS}
      onSubmit={onSubmit}
      onCommand={onCommand}
      placeholder="Message"
      {...overrides}
    />
  );
  return { onSubmit, onCommand };
}

describe("Composer", () => {
  it("opens the popover when the input is a lone slash", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Message"), "/");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(COMMANDS.length);
  });

  it("filters commands by the typed query (trigger or title)", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByPlaceholderText("Message"), "/cl");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(screen.getByText("Clear")).toBeInTheDocument();
    expect(screen.queryByText("Help")).not.toBeInTheDocument();
  });

  it("closes the popover when there is no match", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByPlaceholderText("Message"), "/zzz");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("ArrowDown then Enter selects the highlighted command", async () => {
    const user = userEvent.setup();
    const { onCommand, onSubmit } = setup();
    const textarea = screen.getByPlaceholderText("Message");
    await user.type(textarea, "/");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand).toHaveBeenCalledWith(COMMANDS[1]);
    // Enter while the popover was open must not submit a message.
    expect(onSubmit).not.toHaveBeenCalled();
    // The slash token is cleared after selection.
    expect(textarea).toHaveValue("");
  });

  it("Enter with the popover open selects the first command by default", async () => {
    const user = userEvent.setup();
    const { onCommand } = setup();
    await user.type(screen.getByPlaceholderText("Message"), "/");
    await user.keyboard("{Enter}");
    expect(onCommand).toHaveBeenCalledWith(COMMANDS[0]);
  });

  it("clicking a command fires onCommand and clears the input", async () => {
    const user = userEvent.setup();
    const { onCommand } = setup();
    const textarea = screen.getByPlaceholderText("Message");
    await user.type(textarea, "/");
    await user.click(screen.getByText("Model"));
    expect(onCommand).toHaveBeenCalledWith(COMMANDS[2]);
    expect(textarea).toHaveValue("");
  });

  it("Escape closes the popover", async () => {
    const user = userEvent.setup();
    setup();
    const textarea = screen.getByPlaceholderText("Message");
    await user.type(textarea, "/he");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    // Escape closes by clearing the (always-partial) slash token.
    expect(textarea).toHaveValue("");
  });

  it("plain text plus Enter submits the message instead of opening the popover", async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();
    const textarea = screen.getByPlaceholderText("Message");
    await user.type(textarea, "build a thing");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("build a thing");
  });

  it("does not require onCommand to be provided", async () => {
    const user = userEvent.setup();
    render(<Composer commands={COMMANDS} onSubmit={() => {}} placeholder="Message" />);
    const textarea = screen.getByPlaceholderText("Message");
    await user.type(textarea, "/");
    await user.keyboard("{Enter}");
    // Default behavior clears the token without throwing.
    expect(textarea).toHaveValue("");
  });
});
