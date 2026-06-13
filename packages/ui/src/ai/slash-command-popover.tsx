"use client";

import * as React from "react";

import { cn } from "../lib/utils";

/**
 * A single slash command, as plain data. The component knows nothing about how
 * a command is executed — `id` identifies it, `trigger` is the typed token
 * (e.g. `/help` → `"help"`), and the rest is display metadata. The owning
 * application maps the selected command back to whatever backend action it
 * represents, keeping this primitive fully decoupled.
 */
export interface SlashCommand {
  /** Stable, unique identifier used as a React key and selection handle. */
  id: string;
  /** The token typed after the leading slash, without the slash (e.g. `"help"`). */
  trigger: string;
  /** Human-readable name shown as the primary label of the row. */
  title: string;
  /** Optional secondary text describing what the command does. */
  description?: string;
  /** Optional leading icon (any node) rendered before the title. */
  icon?: React.ReactNode;
}

export interface SlashCommandPopoverProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onSelect"
> {
  /** The (already filtered) commands to render, in display order. */
  commands: SlashCommand[];
  /** Index of the currently highlighted row. Clamped/ignored when out of range. */
  activeIndex: number;
  /** Fired with the command when a row is clicked or activated. */
  onSelect: (command: SlashCommand) => void;
  /** Fired with a row's index when the pointer hovers it (keeps mouse + keyboard in sync). */
  onActiveIndexChange: (index: number) => void;
  /** Whether the popover is shown. Renders nothing when `false`. */
  open: boolean;
}

/**
 * A purely presentational, controlled command list intended to float above a
 * chat input. It owns no state: the parent decides when it is {@link open},
 * which {@link commands} to show (already filtered), and which row is
 * {@link activeIndex}. Hovering a row reports the new active index; clicking a
 * row selects it. All styling is theme-driven so it inherits the host's light
 * or dark palette.
 */
export const SlashCommandPopover = React.forwardRef<HTMLDivElement, SlashCommandPopoverProps>(
  ({ commands, activeIndex, onSelect, onActiveIndexChange, open, className, ...props }, ref) => {
    if (!open || commands.length === 0) return null;

    return (
      <div
        ref={ref}
        role="listbox"
        aria-label="Slash commands"
        className={cn(
          "border-border bg-popover text-popover-foreground max-h-64 w-full overflow-y-auto rounded-md border p-1 shadow-md",
          className
        )}
        {...props}
      >
        {commands.map((command, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={command.id}
              type="button"
              role="option"
              aria-selected={isActive}
              // Use mousedown so selection wins the race against the textarea's
              // blur — clicking a row must not steal focus before we select.
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(command);
              }}
              onMouseEnter={() => onActiveIndexChange(index)}
              className={cn(
                "flex w-full select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-popover-foreground hover:bg-accent/50"
              )}
            >
              {command.icon ? (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">
                  {command.icon}
                </span>
              ) : null}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-baseline gap-2">
                  <span className="text-foreground truncate font-medium">{command.title}</span>
                  <span className="text-muted-foreground shrink-0 font-mono text-xs">
                    /{command.trigger}
                  </span>
                </span>
                {command.description ? (
                  <span className="text-muted-foreground truncate text-xs">
                    {command.description}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    );
  }
);
SlashCommandPopover.displayName = "SlashCommandPopover";
