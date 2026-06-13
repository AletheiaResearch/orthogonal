"use client";

import { ArrowUp, Square } from "lucide-react";
import * as React from "react";

import { cn } from "../../../lib/utils";

/**
 * The name used to identify the textarea within the form. `PromptInput`
 * reads the composed text from the form's `FormData` using this key, which
 * keeps the form fully decoupled from how its children are controlled.
 */
const TEXTAREA_NAME = "prompt-input-message";

/**
 * `useLayoutEffect` warns during SSR (these components ship behind a package
 * boundary into a Next.js app that still server-renders client components).
 * Fall back to `useEffect` on the server to avoid the noise.
 */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

type PromptInputContextValue = {
  /** Submit the form programmatically (used by Enter-to-send in the textarea). */
  submit: () => void;
};

const PromptInputContext = React.createContext<PromptInputContextValue | null>(null);

function usePromptInputContext(component: string): PromptInputContextValue {
  const context = React.useContext(PromptInputContext);
  if (!context) {
    throw new Error(`<${component}> must be used within a <PromptInput>.`);
  }
  return context;
}

/* -------------------------------------------------------------------------- */
/*  PromptInput (form)                                                        */
/* -------------------------------------------------------------------------- */

export interface PromptInputProps extends Omit<
  React.FormHTMLAttributes<HTMLFormElement>,
  "onSubmit"
> {
  /**
   * Called with the trimmed text contents of the textarea when the form is
   * submitted (via the submit button or the Enter shortcut). Submission is
   * skipped automatically when the text is empty.
   */
  onSubmit: (text: string) => void;
}

/**
 * The composer shell: a `<form>` that wraps an auto-resizing textarea, a
 * toolbar row, and a submit/stop button. It owns submission only — text state
 * is controlled by the parent through `PromptInputTextarea`.
 */
export const PromptInput = React.forwardRef<HTMLFormElement, PromptInputProps>(
  ({ className, onSubmit, children, ...props }, ref) => {
    const formRef = React.useRef<HTMLFormElement>(null);

    React.useImperativeHandle(ref, () => formRef.current as HTMLFormElement, []);

    const handleSubmit = React.useCallback(
      (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const text = String(data.get(TEXTAREA_NAME) ?? "").trim();
        if (!text) return;
        onSubmit(text);
      },
      [onSubmit]
    );

    const submit = React.useCallback(() => {
      formRef.current?.requestSubmit();
    }, []);

    const contextValue = React.useMemo<PromptInputContextValue>(() => ({ submit }), [submit]);

    return (
      <PromptInputContext.Provider value={contextValue}>
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className={cn(
            "border-border bg-input focus-within:border-ring flex w-full flex-col overflow-hidden rounded-md border shadow-sm transition",
            className
          )}
          {...props}
        >
          {children}
        </form>
      </PromptInputContext.Provider>
    );
  }
);
PromptInput.displayName = "PromptInput";

/* -------------------------------------------------------------------------- */
/*  PromptInputTextarea                                                       */
/* -------------------------------------------------------------------------- */

export interface PromptInputTextareaProps extends Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "name"
> {
  /** Controlled value of the textarea. */
  value: string;
  /** Called with the next raw string value on every keystroke. */
  onChange: (value: string) => void;
  /** Placeholder text shown when empty. */
  placeholder?: string;
  /**
   * When `true` (the default), pressing Enter submits the enclosing form and
   * Shift+Enter inserts a newline. Set to `false` to disable the shortcut and
   * make Enter always insert a newline.
   */
  onSubmitShortcut?: boolean;
  /** Minimum number of visible text rows before auto-resizing kicks in. */
  minRows?: number;
  /** Maximum pixel height before the textarea starts to scroll internally. */
  maxHeight?: number;
}

/**
 * An auto-resizing, controlled textarea. Grows with its content up to
 * `maxHeight`, after which it scrolls. By default Enter submits and
 * Shift+Enter inserts a newline.
 */
export const PromptInputTextarea = React.forwardRef<HTMLTextAreaElement, PromptInputTextareaProps>(
  (
    {
      className,
      value,
      onChange,
      placeholder = "What do you want to build?",
      onSubmitShortcut = true,
      minRows = 1,
      maxHeight = 240,
      onKeyDown,
      disabled,
      ...props
    },
    ref
  ) => {
    const { submit } = usePromptInputContext("PromptInputTextarea");
    const innerRef = React.useRef<HTMLTextAreaElement>(null);

    React.useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement, []);

    // Auto-resize: collapse, then grow to scrollHeight (capped at maxHeight).
    useIsomorphicLayoutEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = "auto";
      const next = Math.min(el.scrollHeight, maxHeight);
      el.style.height = `${next}px`;
      el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
    }, [value, maxHeight]);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;
      // Ignore IME composition (e.g. selecting from a CJK candidate list).
      if (event.nativeEvent.isComposing) return;
      if (onSubmitShortcut && event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    };

    return (
      <textarea
        ref={innerRef}
        name={TEXTAREA_NAME}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={minRows}
        className={cn(
          "text-foreground placeholder:text-muted-foreground w-full resize-none bg-transparent px-4 pb-2 pt-4 text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    );
  }
);
PromptInputTextarea.displayName = "PromptInputTextarea";

/* -------------------------------------------------------------------------- */
/*  PromptInputToolbar / PromptInputTools                                     */
/* -------------------------------------------------------------------------- */

export type PromptInputToolbarProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * The bottom row of the composer. Visually separated from the textarea by a
 * top border and laid out as a flex row that wraps on small screens.
 */
export const PromptInputToolbar = React.forwardRef<HTMLDivElement, PromptInputToolbarProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "border-border-muted flex flex-wrap items-center gap-2 border-t px-3 py-2",
        className
      )}
      {...props}
    />
  )
);
PromptInputToolbar.displayName = "PromptInputToolbar";

export type PromptInputToolsProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * A flex container for grouping controls inside the toolbar (e.g. the model
 * selector and effort control on the left, the submit button on the right).
 */
export const PromptInputTools = React.forwardRef<HTMLDivElement, PromptInputToolsProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-2", className)}
      {...props}
    />
  )
);
PromptInputTools.displayName = "PromptInputTools";

/* -------------------------------------------------------------------------- */
/*  PromptInputModelSelect (slot)                                             */
/* -------------------------------------------------------------------------- */

export type PromptInputModelSelectProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * A presentational slot for a model selector. The actual select (a `Combobox`,
 * `Select`, or anything else) is provided as `children`; this only supplies
 * consistent spacing and muted styling so it lines up with the rest of the
 * toolbar.
 */
export const PromptInputModelSelect = React.forwardRef<HTMLDivElement, PromptInputModelSelectProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("text-muted-foreground flex items-center gap-1 text-sm", className)}
      {...props}
    />
  )
);
PromptInputModelSelect.displayName = "PromptInputModelSelect";

/* -------------------------------------------------------------------------- */
/*  PromptInputEffort                                                         */
/* -------------------------------------------------------------------------- */

export interface PromptInputEffortProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onSelect" | "value"
> {
  /** The ordered list of effort levels to cycle through, e.g. ["low", "medium", "high"]. */
  efforts: string[];
  /** The currently selected effort. If unknown, cycling starts at the first entry. */
  value: string | undefined;
  /** Called with the next effort when the control is clicked. */
  onSelect: (value: string) => void;
}

/**
 * A compact, click-to-cycle reasoning-effort control. Decoupled from any model
 * config — it takes a plain `efforts` array and cycles through it on each
 * click. Renders nothing when `efforts` is empty.
 */
export const PromptInputEffort = React.forwardRef<HTMLButtonElement, PromptInputEffortProps>(
  ({ className, efforts, value, onSelect, disabled, onClick, ...props }, ref) => {
    if (efforts.length === 0) return null;

    const currentIndex = value ? efforts.indexOf(value) : -1;
    const label = value ?? efforts[0] ?? "default";

    const handleCycle = (event: React.MouseEvent<HTMLButtonElement>) => {
      // Run any consumer-provided handler first; bail on the cycle if it
      // prevents the default so analytics/extra behaviour can opt out.
      onClick?.(event);
      if (event.defaultPrevented) return;
      // -1 (unknown/none selected) wraps to index 0.
      const nextIndex = (currentIndex + 1) % efforts.length;
      onSelect(efforts[nextIndex]);
    };

    return (
      <button
        ref={ref}
        type="button"
        onClick={handleCycle}
        disabled={disabled}
        aria-label={`Reasoning effort: ${label} (click to cycle)`}
        title={`Reasoning effort: ${label} (click to cycle)`}
        className={cn(
          "text-muted-foreground hover:bg-accent hover:text-foreground rounded-sm px-2 py-0.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        {label}
      </button>
    );
  }
);
PromptInputEffort.displayName = "PromptInputEffort";

/* -------------------------------------------------------------------------- */
/*  PromptInputSubmit                                                         */
/* -------------------------------------------------------------------------- */

export interface PromptInputSubmitProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "type"
> {
  /**
   * `"ready"` shows a send arrow and submits the form on click. `"streaming"`
   * shows a stop square — wire `onClick` to your cancel handler in that state.
   * The button `type` is derived from `status` and cannot be overridden.
   */
  status?: "ready" | "streaming";
}

/**
 * The composer's primary action button. In `"ready"` state it is a submit
 * button that sends the form; in `"streaming"` state it becomes a stop button
 * (type `button`) so the parent can cancel an in-flight response via `onClick`.
 */
export const PromptInputSubmit = React.forwardRef<HTMLButtonElement, PromptInputSubmitProps>(
  ({ className, status = "ready", disabled, children, ...props }, ref) => {
    const isStreaming = status === "streaming";

    return (
      <button
        ref={ref}
        {...props}
        type={isStreaming ? "button" : "submit"}
        disabled={disabled}
        aria-label={isStreaming ? "Stop" : "Send"}
        title={isStreaming ? "Stop" : "Send"}
        className={cn(
          "bg-accent text-accent-foreground hover:bg-accent/90 ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-30",
          className
        )}
      >
        {children ??
          (isStreaming ? (
            <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          ) : (
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          ))}
      </button>
    );
  }
);
PromptInputSubmit.displayName = "PromptInputSubmit";

export { PromptInput as default };
