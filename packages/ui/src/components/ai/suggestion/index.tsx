"use client";

import * as React from "react";

import { cn } from "../../../lib/utils";
import { Button } from "../../primitives/button";

interface SuggestionsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Suggestion chips to render in the scrollable row. */
  children: React.ReactNode;
}

/**
 * A horizontally scrollable row that lays out a set of {@link Suggestion} chips.
 *
 * Intended for an empty composer / chat input, where it offers the user a handful of
 * starter prompts. Overflowing chips scroll horizontally rather than wrapping. Purely a
 * layout container — it knows nothing about agents, sessions, or any wire protocol.
 */
const Suggestions = React.forwardRef<HTMLDivElement, SuggestionsProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        // A single non-wrapping row that scrolls horizontally on overflow. A thin,
        // theme-aware scrollbar keeps it from feeling heavy in the warm orto palette.
        "flex w-full items-center gap-2 overflow-x-auto whitespace-nowrap",
        "[scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5",
        "[&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full",
        "[&::-webkit-scrollbar-track]:bg-transparent",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
Suggestions.displayName = "Suggestions";

interface SuggestionProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /**
   * The prompt text this chip represents. This is the contract: it is both the default
   * visible label and the value handed back to {@link SuggestionProps.onClick}.
   */
  suggestion: string;
  /** Fired with the {@link SuggestionProps.suggestion} string (not a DOM event) when clicked. */
  onClick?: (suggestion: string) => void;
  /** Optional custom label; falls back to {@link SuggestionProps.suggestion} when omitted. */
  children?: React.ReactNode;
}

/**
 * A single clickable prompt-suggestion pill.
 *
 * Passing `suggestion` is the contract — it is the displayed label (unless overridden by
 * `children`) and the exact string passed to `onClick`, so callers never have to read the
 * DOM event to learn which suggestion was chosen.
 */
const Suggestion = React.forwardRef<HTMLButtonElement, SuggestionProps>(
  ({ suggestion, onClick, children, className, type, ...props }, ref) => (
    <Button
      ref={ref}
      type={type ?? "button"}
      variant="outline"
      size="sm"
      onClick={() => onClick?.(suggestion)}
      className={cn("text-muted-foreground shrink-0 rounded-md font-normal", className)}
      {...props}
    >
      {children ?? suggestion}
    </Button>
  )
);
Suggestion.displayName = "Suggestion";

export { Suggestions, Suggestion };
export type { SuggestionsProps, SuggestionProps };

export { Suggestion as default };
