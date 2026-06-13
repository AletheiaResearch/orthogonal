"use client";

import { useState } from "react";

import { ChevronRightIcon } from "../components/primitives/icons";
import { cn } from "../lib/utils";

export interface ToolGroupProps {
  /** Primary header label, e.g. the tool name `"Read"`. Always visible. */
  label: string;
  /**
   * Optional secondary summary shown after the label, e.g. `"3 files"`. Rendered
   * in muted text alongside (or in place of) the derived count.
   */
  summary?: string;
  /** Optional leading icon for the header (typically a tool glyph). */
  icon?: React.ReactNode;
  /** Whether the group starts expanded on first mount. Defaults to `false`. */
  defaultOpen?: boolean;
  /**
   * Optional number of invocations in the group. When provided and no `summary`
   * is given, it is rendered as the derived summary, e.g. `"· 3"`.
   */
  count?: number;
  /**
   * Additional class names merged onto the outermost wrapper.
   */
  className?: string;
  /** The Tool children revealed inside the ruled list when expanded. */
  children: React.ReactNode;
}

/**
 * Collapses a run of related tool invocations under one summary header
 * (e.g. `"Read · 3 files"`), expanding to a ruled list of `Tool` children.
 *
 * Fully decoupled: it knows nothing about any agent or session protocol and is
 * driven entirely by props and the children you render inside it.
 */
export function ToolGroup({
  label,
  summary,
  icon,
  defaultOpen = false,
  count,
  className,
  children,
}: ToolGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Prefer an explicit summary; otherwise derive a terse one from the count.
  const derivedSummary = summary ?? (typeof count === "number" ? `· ${count}` : undefined);

  return (
    <div className={cn("py-1", className)}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          "-mx-2 flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm",
          "hover:bg-accent transition-colors"
        )}
      >
        <ChevronRightIcon
          className={cn(
            "text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform duration-200",
            isOpen && "rotate-90"
          )}
        />
        {icon != null && (
          <span className="text-muted-foreground flex shrink-0 items-center">{icon}</span>
        )}
        <span className="text-foreground font-medium">{label}</span>
        {derivedSummary != null && (
          <span className="text-muted-foreground truncate">{derivedSummary}</span>
        )}
      </button>

      {isOpen && (
        <div className="border-border ml-4 mt-1 flex flex-col border-l pl-3">{children}</div>
      )}
    </div>
  );
}
