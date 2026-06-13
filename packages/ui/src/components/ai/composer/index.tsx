"use client";

import * as React from "react";

import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "../prompt-input";
import { SlashCommandPopover, type SlashCommand } from "../slash-command-popover";

/**
 * The trigger rule. The popover opens only when the *entire* (trimmed) input is
 * a slash token: a leading `/` optionally followed by word characters. The
 * single capture group is the query used both for filtering and for replacing
 * the token when a command is selected. Detection, filtering, and replacement
 * all share this one rule so they can never drift apart.
 */
const SLASH_PATTERN = /^\/(\w*)$/;

/** Extract the slash query from the raw input, or `null` if it is not a slash token. */
function parseSlashQuery(value: string): string | null {
  const match = SLASH_PATTERN.exec(value.trim());
  return match ? match[1] : null;
}

/**
 * Filter commands by a slash query, matching against both the trigger and the
 * title (case-insensitive). An empty query (just `/` typed) returns everything.
 */
function filterCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  if (query === "") return commands;
  const needle = query.toLowerCase();
  return commands.filter(
    (command) =>
      command.trigger.toLowerCase().includes(needle) || command.title.toLowerCase().includes(needle)
  );
}

export interface ComposerProps {
  /** The full set of slash commands available; filtered internally as the user types. */
  commands: SlashCommand[];
  /** Called with the trimmed message text on submit (Enter with the popover closed, or Send). */
  onSubmit: (text: string) => void;
  /**
   * Called when a slash command is chosen from the popover. The default
   * behavior clears the slash token from the input; provide this to react to
   * the selection (run the command, open a picker, etc.).
   */
  onCommand?: (command: SlashCommand) => void;
  /** Placeholder shown in the textarea when empty. */
  placeholder?: string;
  /** Extra classes merged onto the `PromptInput` form container. */
  className?: string;
  /**
   * Optional toolbar content rendered on the left side of the toolbar row
   * (e.g. a model selector or effort control). When omitted, only the submit
   * button is shown.
   */
  toolbar?: React.ReactNode;
  /** Submit button status. `"streaming"` turns it into a Stop button. */
  status?: "ready" | "streaming";
  /** Fired when the Stop button is clicked while `status === "streaming"`. */
  onStop?: () => void;
}

/**
 * A chat composer that layers slash-command discovery on top of
 * {@link PromptInput}. It reuses the existing input shell — auto-resizing
 * textarea, toolbar, and submit/stop button — and owns only the slash layer:
 * detecting when the input is a slash token, opening the {@link
 * SlashCommandPopover}, filtering commands, tracking the active row, and
 * handling keyboard navigation. It is fully decoupled: commands are passed in
 * as plain data and selection is reported through `onCommand`, so the host can
 * wire commands to any backend.
 */
export const Composer = React.forwardRef<HTMLTextAreaElement, ComposerProps>(
  (
    { commands, onSubmit, onCommand, placeholder, className, toolbar, status = "ready", onStop },
    ref
  ) => {
    const [value, setValue] = React.useState("");
    const [activeIndex, setActiveIndex] = React.useState(0);

    const query = parseSlashQuery(value);
    const isSlashMode = query !== null;
    const filtered = React.useMemo(
      () => (isSlashMode ? filterCommands(commands, query) : []),
      [isSlashMode, commands, query]
    );
    const open = isSlashMode && filtered.length > 0;

    // Reset the highlight to the top whenever the visible list changes, and keep
    // it clamped to the list bounds so keyboard nav never points off the end.
    React.useEffect(() => {
      setActiveIndex((current) => {
        if (filtered.length === 0) return 0;
        return Math.min(current, filtered.length - 1);
      });
    }, [query, filtered.length]);

    const selectCommand = React.useCallback(
      (command: SlashCommand) => {
        if (onCommand) {
          onCommand(command);
        }
        // Default behavior: clear the slash token so the input is ready for the
        // next message (or whatever flow `onCommand` kicked off).
        setValue("");
        setActiveIndex(0);
      },
      [onCommand]
    );

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!open) return;
      // While the popover is open, intercept navigation keys before the
      // textarea's built-in Enter-submit (it bails when defaultPrevented).
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setActiveIndex((i) => (i + 1) % filtered.length);
          break;
        case "ArrowUp":
          event.preventDefault();
          setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
          break;
        case "Enter":
          if (event.shiftKey) return;
          event.preventDefault();
          if (filtered[activeIndex]) selectCommand(filtered[activeIndex]);
          break;
        case "Escape":
          event.preventDefault();
          // Clearing the slash token closes the popover (no longer a slash token).
          setValue("");
          setActiveIndex(0);
          break;
        default:
          break;
      }
    };

    return (
      <div className="relative w-full">
        <SlashCommandPopover
          open={open}
          commands={filtered}
          activeIndex={activeIndex}
          onSelect={selectCommand}
          onActiveIndexChange={setActiveIndex}
          className="absolute bottom-full left-0 z-10 mb-1"
        />
        <PromptInput onSubmit={onSubmit} className={className}>
          <PromptInputTextarea
            ref={ref}
            value={value}
            onChange={setValue}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-expanded={open}
            aria-haspopup="listbox"
          />
          <PromptInputToolbar>
            <PromptInputTools>{toolbar}</PromptInputTools>
            <PromptInputSubmit
              status={status}
              disabled={status === "ready" && !value.trim()}
              onClick={status === "streaming" ? onStop : undefined}
            />
          </PromptInputToolbar>
        </PromptInput>
      </div>
    );
  }
);
Composer.displayName = "Composer";

export { Composer as default };
