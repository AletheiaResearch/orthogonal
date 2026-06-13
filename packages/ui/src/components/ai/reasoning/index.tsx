"use client";

import * as React from "react";

import { cn } from "../../../lib/utils";
import { ChevronDownIcon, SparkleIcon } from "../../primitives/icons";

interface ReasoningContextValue {
  /** Whether the reasoning panel is currently expanded. */
  isOpen: boolean;
  /** Request a new open state — respects controlled mode. */
  setIsOpen: (next: boolean) => void;
  /** Whether reasoning tokens are still streaming in. */
  isStreaming: boolean;
  /** How long the model spent thinking, in milliseconds. */
  durationMs: number;
}

const ReasoningContext = React.createContext<ReasoningContextValue | null>(null);

function useReasoning(component: string): ReasoningContextValue {
  const ctx = React.useContext(ReasoningContext);
  if (!ctx) {
    throw new Error(`${component} must be used within a <Reasoning> component.`);
  }
  return ctx;
}

export interface ReasoningProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  /**
   * Whether reasoning tokens are still streaming. Drives the default trigger
   * label and (when uncontrolled) auto-expands the panel while active.
   */
  isStreaming?: boolean;
  /** Initial open state when the component is uncontrolled. Defaults to `false`. */
  defaultOpen?: boolean;
  /** Controlled open state. When provided, the component will not manage its own state. */
  open?: boolean;
  /** Called whenever an open/close is requested, with the next open state. */
  onOpenChange?: (open: boolean) => void;
  /** Milliseconds the model spent thinking — surfaced in the default completed label. */
  durationMs?: number;
  children?: React.ReactNode;
}

/**
 * Collapsible container for an agent's thinking / reasoning tokens. Provides
 * open state to {@link ReasoningTrigger} and {@link ReasoningContent} via
 * context, and works in both controlled (`open` + `onOpenChange`) and
 * uncontrolled (`defaultOpen`) modes.
 */
export function Reasoning({
  isStreaming = false,
  defaultOpen = false,
  open,
  onOpenChange,
  durationMs = 0,
  className,
  children,
  ...props
}: ReasoningProps) {
  const isControlled = open !== undefined;
  // When uncontrolled and mounting mid-stream, start open so live reasoning is
  // visible immediately — the streaming effect only handles later transitions.
  const [internalOpen, setInternalOpen] = React.useState(
    defaultOpen || (!isControlled && isStreaming)
  );

  const isOpen = isControlled ? open : internalOpen;

  const setIsOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setInternalOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  // Signature touch: auto-expand while streaming, auto-collapse once it ends —
  // but only when uncontrolled, so a controlled parent stays authoritative.
  const wasStreaming = React.useRef(isStreaming);
  React.useEffect(() => {
    if (isControlled) {
      wasStreaming.current = isStreaming;
      return;
    }
    if (isStreaming && !wasStreaming.current) {
      setInternalOpen(true);
    } else if (!isStreaming && wasStreaming.current) {
      setInternalOpen(false);
    }
    wasStreaming.current = isStreaming;
  }, [isStreaming, isControlled]);

  const contextValue = React.useMemo<ReasoningContextValue>(
    () => ({ isOpen, setIsOpen, isStreaming, durationMs }),
    [isOpen, setIsOpen, isStreaming, durationMs]
  );

  return (
    <ReasoningContext.Provider value={contextValue}>
      <div
        data-state={isOpen ? "open" : "closed"}
        data-streaming={isStreaming ? "true" : undefined}
        className={cn("flex flex-col gap-1", className)}
        {...props}
      >
        {children}
      </div>
    </ReasoningContext.Provider>
  );
}

export interface ReasoningTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Custom trigger label. Defaults to `Thinking…` while streaming, otherwise
   * `Thought for Ns` derived from the `durationMs` of the parent `Reasoning`.
   */
  children?: React.ReactNode;
}

/**
 * Clickable header that toggles the reasoning panel. Renders a thinking
 * indicator, a default or custom label, and a chevron that rotates with the
 * open state.
 */
export function ReasoningTrigger({
  children,
  className,
  onClick,
  ...props
}: ReasoningTriggerProps) {
  const { isOpen, setIsOpen, isStreaming, durationMs } = useReasoning("ReasoningTrigger");

  const label =
    children ?? (isStreaming ? "Thinking…" : `Thought for ${Math.round(durationMs / 1000)}s`);

  return (
    <button
      type="button"
      aria-expanded={isOpen}
      data-state={isOpen ? "open" : "closed"}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          setIsOpen(!isOpen);
        }
      }}
      className={cn(
        "text-muted-foreground hover:text-foreground group flex w-full items-center gap-1.5 rounded-md py-1 text-left text-sm transition-colors",
        className
      )}
      {...props}
    >
      <SparkleIcon
        className={cn("text-accent h-3.5 w-3.5 shrink-0", isStreaming && "animate-pulse")}
      />
      <span className="truncate">{label}</span>
      <ChevronDownIcon
        className={cn(
          "text-secondary-foreground ml-auto h-3.5 w-3.5 shrink-0 transition-transform duration-200",
          isOpen && "rotate-180"
        )}
      />
    </button>
  );
}

export interface ReasoningContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * The reasoning body. Rendered only while the parent `Reasoning` is open, with
 * the warm muted styling used for secondary, low-emphasis content.
 */
export function ReasoningContent({ children, className, ...props }: ReasoningContentProps) {
  const { isOpen } = useReasoning("ReasoningContent");

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={cn(
        "border-border text-muted-foreground ml-1.5 border-l pl-3 text-sm leading-relaxed",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { Reasoning as default };
