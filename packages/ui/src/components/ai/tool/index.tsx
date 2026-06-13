"use client";

import { ChevronDownIcon, CircleAlert, CircleCheck, Loader2, WrenchIcon } from "lucide-react";
import * as React from "react";

import { cn } from "../../../lib/utils";

/** Lifecycle states of a tool invocation, decoupled from any agent/session protocol. */
export type ToolState = "input-streaming" | "input-available" | "output-available" | "output-error";

interface ToolContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Shared id for the content pane the header points `aria-controls` at, when one is rendered. */
  contentId: string;
  /**
   * Id of the registered content pane that should carry `contentId`, or `null` when no pane is
   * rendered. Lets the header drop `aria-controls` for compositions with no content
   * (e.g. `ToolHeader` + an empty/absent `ToolOutput`) while ensuring exactly one element owns the
   * id even when both `ToolInput` and `ToolOutput` render.
   */
  contentOwnerId: string | null;
  /** Registers a rendered content pane by its stable key. Returns an unregister callback. */
  registerContent: (key: string) => () => void;
}

const ToolContext = React.createContext<ToolContextValue | null>(null);

function useToolContext(component: string): ToolContextValue {
  const ctx = React.useContext(ToolContext);
  if (!ctx) {
    throw new Error(`${component} must be used within a <Tool>.`);
  }
  return ctx;
}

export interface ToolProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Initial open state when uncontrolled. Defaults to `false`. */
  defaultOpen?: boolean;
  /** Controlled open state. When provided, the component does not manage its own state. */
  open?: boolean;
  /** Called whenever the open state should change (controlled or uncontrolled). */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Generic collapsible tool-invocation card. Compose with {@link ToolHeader}, {@link ToolInput}, and
 * {@link ToolOutput}. Works in both controlled (`open` + `onOpenChange`) and uncontrolled
 * (`defaultOpen`) modes.
 */
export function Tool({
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  className,
  children,
  ...props
}: ToolProps) {
  const contentId = React.useId();
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  // Track which content panes are rendered (in mount order) so the header can drop
  // `aria-controls` when none exist, and so exactly one pane owns `contentId`.
  const [contentKeys, setContentKeys] = React.useState<readonly string[]>([]);
  const registerContent = React.useCallback((key: string) => {
    setContentKeys((keys) => [...keys, key]);
    return () => setContentKeys((keys) => keys.filter((k) => k !== key));
  }, []);
  const contentOwnerId = contentKeys.length > 0 ? contentKeys[0] : null;

  const value = React.useMemo<ToolContextValue>(
    () => ({ open, setOpen, contentId, contentOwnerId, registerContent }),
    [open, setOpen, contentId, contentOwnerId, registerContent]
  );

  return (
    <ToolContext.Provider value={value}>
      <div
        data-state={open ? "open" : "closed"}
        className={cn(
          "border-border bg-card text-card-foreground overflow-hidden rounded-md border",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </ToolContext.Provider>
  );
}

const STATE_META: Record<ToolState, { label: string; icon: React.ReactNode; badgeClass: string }> =
  {
    "input-streaming": {
      label: "Pending",
      icon: <Loader2 className="h-3 w-3 animate-spin" aria-hidden />,
      badgeClass: "bg-muted text-muted-foreground",
    },
    "input-available": {
      label: "Running",
      icon: <Loader2 className="h-3 w-3 animate-spin" aria-hidden />,
      badgeClass: "bg-accent-muted text-accent",
    },
    "output-available": {
      label: "Completed",
      icon: <CircleCheck className="h-3 w-3" aria-hidden />,
      badgeClass: "bg-success-muted text-success",
    },
    "output-error": {
      label: "Error",
      icon: <CircleAlert className="h-3 w-3" aria-hidden />,
      badgeClass: "bg-destructive-muted text-destructive",
    },
  };

export interface ToolHeaderProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "type"
> {
  /** Display name of the tool being invoked. */
  name: string;
  /** Lifecycle state, driving the status badge and tone. */
  state: ToolState;
  /** Optional short description of the invocation (e.g. the primary argument). */
  summary?: string;
  /** Optional leading icon. Falls back to a generic wrench glyph. */
  icon?: React.ReactNode;
}

/**
 * Clickable header for a {@link Tool}. Renders the tool name, a state badge, an optional summary,
 * and a chevron that reflects/toggles the open state.
 */
export function ToolHeader({
  name,
  state,
  summary,
  icon,
  className,
  onClick,
  ...props
}: ToolHeaderProps) {
  const { open, setOpen, contentId, contentOwnerId } = useToolContext("ToolHeader");
  const meta = STATE_META[state];

  return (
    <button
      type="button"
      aria-expanded={open}
      // Only reference the content pane when one is actually rendered; output-only or
      // empty compositions have no element with `contentId`, so a dangling ref is avoided.
      aria-controls={contentOwnerId ? contentId : undefined}
      data-state={open ? "open" : "closed"}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          setOpen(!open);
        }
      }}
      className={cn(
        "hover:bg-muted flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
        className
      )}
      {...props}
    >
      <span className="text-secondary-foreground flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center">
        {icon ?? <WrenchIcon className="h-3.5 w-3.5" aria-hidden />}
      </span>
      <span className="text-foreground truncate font-medium">{name}</span>
      {summary ? (
        <span className="text-muted-foreground truncate" title={summary}>
          {summary}
        </span>
      ) : null}
      <span
        className={cn(
          "ml-auto flex flex-shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium",
          meta.badgeClass
        )}
      >
        {meta.icon}
        {meta.label}
      </span>
      <ChevronDownIcon
        aria-hidden
        className={cn(
          "text-secondary-foreground h-4 w-4 flex-shrink-0 transition-transform duration-200",
          open && "rotate-180"
        )}
      />
    </button>
  );
}

export interface ToolInputProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Formatted argument content (e.g. a `<pre>` of JSON). */
  children: React.ReactNode;
}

/**
 * Collapsible pane that holds the formatted invocation arguments. Visible only when the parent
 * {@link Tool} is open.
 */
export function ToolInput({ className, children, ...props }: ToolInputProps) {
  const { open, contentId, contentOwnerId, registerContent } = useToolContext("ToolInput");
  const paneKey = React.useId();
  const isRendered = open;

  React.useEffect(() => {
    if (!isRendered) return;
    return registerContent(paneKey);
  }, [isRendered, paneKey, registerContent]);

  if (!isRendered) return null;

  return (
    <div
      id={contentOwnerId === paneKey ? contentId : undefined}
      className={cn("border-border-muted border-t px-3 py-2", className)}
      {...props}
    >
      <div className="text-muted-foreground mb-1 text-xs font-medium">Input</div>
      <div className="text-foreground overflow-x-auto text-xs">{children}</div>
    </div>
  );
}

export interface ToolOutputProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Formatted result content. */
  children?: React.ReactNode;
  /** When set, renders an error message instead of (or alongside) the output. */
  errorText?: string;
}

/**
 * Collapsible pane that holds the tool result, or an error message when `errorText` is provided.
 * Visible only when the parent {@link Tool} is open.
 */
export function ToolOutput({ className, children, errorText, ...props }: ToolOutputProps) {
  const { open, contentId, contentOwnerId, registerContent } = useToolContext("ToolOutput");
  const paneKey = React.useId();
  const isRendered = open && (errorText != null || children != null);

  React.useEffect(() => {
    if (!isRendered) return;
    return registerContent(paneKey);
  }, [isRendered, paneKey, registerContent]);

  if (!isRendered) return null;

  return (
    <div
      id={contentOwnerId === paneKey ? contentId : undefined}
      className={cn("border-border-muted border-t px-3 py-2", className)}
      {...props}
    >
      {errorText != null ? (
        <>
          <div className="text-destructive mb-1 text-xs font-medium">Error</div>
          <div className="text-destructive overflow-x-auto text-xs">{errorText}</div>
        </>
      ) : (
        <>
          <div className="text-muted-foreground mb-1 text-xs font-medium">Output</div>
          <div className="text-foreground overflow-x-auto text-xs">{children}</div>
        </>
      )}
    </div>
  );
}

export { Tool as default };
