"use client";

import { BookIcon, ChevronDownIcon, ExternalLinkIcon } from "lucide-react";
import * as React from "react";

import { cn } from "../../../lib/utils";

/**
 * Sources — AI-Elements-style collapsible block listing the external links an
 * agent referenced while producing an answer. Fully decoupled: it knows nothing
 * about any agent/session protocol and is driven entirely by props and children.
 *
 * Compound API:
 *   <Sources count={3}>
 *     <SourcesTrigger />          // "Used 3 sources" + chevron
 *     <SourcesContent>
 *       <Source href="…" title="…" />
 *       <Source href="…" title="…" />
 *     </SourcesContent>
 *   </Sources>
 */

interface SourcesContextValue {
  open: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  count?: number;
  contentId: string;
  triggerId: string;
}

const SourcesContext = React.createContext<SourcesContextValue | null>(null);

function useSourcesContext(component: string): SourcesContextValue {
  const ctx = React.useContext(SourcesContext);
  if (!ctx) {
    throw new Error(`${component} must be used within <Sources>`);
  }
  return ctx;
}

export interface SourcesProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of sources, used by the default trigger label ("Used N sources"). */
  count?: number;
  /** Whether the block starts expanded. Defaults to `false` (collapsed). */
  defaultOpen?: boolean;
  /** Controlled open state. When provided, the component does not manage its own state. */
  open?: boolean;
  /** Called when the open state should change (with both controlled and uncontrolled usage). */
  onOpenChange?: (open: boolean) => void;
}

function Sources({
  count,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  className,
  children,
  ...props
}: SourcesProps) {
  const isControlled = openProp !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = isControlled ? openProp : uncontrolledOpen;

  const reactId = React.useId();
  const contentId = `sources-content-${reactId}`;
  const triggerId = `sources-trigger-${reactId}`;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  const toggle = React.useCallback(() => {
    setOpen(!open);
  }, [open, setOpen]);

  const value = React.useMemo<SourcesContextValue>(
    () => ({ open, toggle, setOpen, count, contentId, triggerId }),
    [open, toggle, setOpen, count, contentId, triggerId]
  );

  return (
    <SourcesContext.Provider value={value}>
      <div
        className={cn(
          "border-border bg-background text-foreground rounded-md border text-sm",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </SourcesContext.Provider>
  );
}

export interface SourcesTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Override the default "Used N sources" label. Accepts any node; when omitted
   * the label is derived from the `count` passed to `<Sources>`.
   */
  label?: React.ReactNode;
}

function SourcesTrigger({ label, className, children, onClick, ...props }: SourcesTriggerProps) {
  const { open, toggle, count, contentId, triggerId } = useSourcesContext("SourcesTrigger");

  const defaultLabel =
    count === undefined ? "Sources" : `Used ${count} ${count === 1 ? "source" : "sources"}`;

  return (
    <button
      type="button"
      id={triggerId}
      aria-expanded={open}
      aria-controls={contentId}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          toggle();
        }
      }}
      className={cn(
        "text-muted-foreground hover:bg-accent-muted hover:text-foreground focus-visible:ring-ring flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left font-medium transition-colors focus-visible:outline-none focus-visible:ring-2",
        className
      )}
      {...props}
    >
      <span className="flex items-center gap-2">
        <BookIcon className="size-4 shrink-0" aria-hidden="true" />
        {children ?? label ?? defaultLabel}
      </span>
      <ChevronDownIcon
        aria-hidden="true"
        className={cn(
          "text-secondary-foreground size-4 shrink-0 transition-transform duration-200",
          open && "rotate-180"
        )}
      />
    </button>
  );
}

export type SourcesContentProps = React.HTMLAttributes<HTMLDivElement>;

function SourcesContent({ className, children, ...props }: SourcesContentProps) {
  const { open, contentId, triggerId } = useSourcesContext("SourcesContent");

  if (!open) {
    return null;
  }

  return (
    <div
      id={contentId}
      role="region"
      aria-labelledby={triggerId}
      className={cn("border-border-muted flex flex-col gap-0.5 border-t p-1.5", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export interface SourceProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  /** The external URL the source points to. Opened in a new, isolated tab. */
  href: string;
  /** Display label for the source. Falls back to the href when omitted. */
  title?: string;
}

function Source({ href, title, className, children, ...props }: SourceProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring group flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2",
        className
      )}
      {...props}
    >
      {children ?? (
        <>
          <ExternalLinkIcon
            className="text-secondary-foreground group-hover:text-foreground size-3.5 shrink-0 transition-colors"
            aria-hidden="true"
          />
          <span className="truncate underline-offset-2 group-hover:underline">{title ?? href}</span>
        </>
      )}
    </a>
  );
}

export { Sources, SourcesTrigger, SourcesContent, Source };

export { Sources as default };
