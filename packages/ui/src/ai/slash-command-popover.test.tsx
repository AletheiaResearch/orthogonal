import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SlashCommandPopover, type SlashCommand } from "./slash-command-popover";

const COMMANDS: SlashCommand[] = [
  { id: "help", trigger: "help", title: "Help", description: "Show available commands" },
  { id: "clear", trigger: "clear", title: "Clear", description: "Clear the conversation" },
  { id: "model", trigger: "model", title: "Model" },
];

describe("SlashCommandPopover", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <SlashCommandPopover
        open={false}
        commands={COMMANDS}
        activeIndex={0}
        onSelect={() => {}}
        onActiveIndexChange={() => {}}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when open but the command list is empty", () => {
    const { container } = render(
      <SlashCommandPopover
        open
        commands={[]}
        activeIndex={0}
        onSelect={() => {}}
        onActiveIndexChange={() => {}}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders command titles, triggers, and descriptions", () => {
    render(
      <SlashCommandPopover
        open
        commands={COMMANDS}
        activeIndex={0}
        onSelect={() => {}}
        onActiveIndexChange={() => {}}
      />
    );
    expect(screen.getByText("Help")).toBeInTheDocument();
    expect(screen.getByText("/help")).toBeInTheDocument();
    expect(screen.getByText("Show available commands")).toBeInTheDocument();
    expect(screen.getByText("Clear the conversation")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("marks the active row as selected", () => {
    render(
      <SlashCommandPopover
        open
        commands={COMMANDS}
        activeIndex={1}
        onSelect={() => {}}
        onActiveIndexChange={() => {}}
      />
    );
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
  });

  it("fires onSelect with the clicked command", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <SlashCommandPopover
        open
        commands={COMMANDS}
        activeIndex={0}
        onSelect={onSelect}
        onActiveIndexChange={() => {}}
      />
    );
    await user.click(screen.getByText("Clear"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(COMMANDS[1]);
  });

  it("reports the hovered row index via onActiveIndexChange", async () => {
    const user = userEvent.setup();
    const onActiveIndexChange = vi.fn();
    render(
      <SlashCommandPopover
        open
        commands={COMMANDS}
        activeIndex={0}
        onSelect={() => {}}
        onActiveIndexChange={onActiveIndexChange}
      />
    );
    await user.hover(screen.getByText("Model"));
    expect(onActiveIndexChange).toHaveBeenCalledWith(2);
  });
});
