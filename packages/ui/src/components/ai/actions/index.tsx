"use client";

import * as React from "react";

import { cn } from "../../../lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../overlay/tooltip";
import { Button } from "../../primitives/button";

export interface ActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The `Action` buttons (or any nodes) to render in the row. */
  children: React.ReactNode;
  /** Extra classes merged onto the row container. */
  className?: string;
}

/**
 * A horizontal row of icon-button actions attached to a message — copy, retry,
 * thumbs up/down, and similar quick controls.
 *
 * The row marks itself as a Tailwind `group`, so children can fade in on hover
 * or keyboard focus via `group-hover` / `group-focus-within`. The bundled
 * `Action` already opts into this reveal behavior.
 *
 * Decoupled by design: it knows nothing about messages, agents, or sessions —
 * compose it with whatever `Action`s (or arbitrary nodes) you need.
 */
const Actions = React.forwardRef<HTMLDivElement, ActionsProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      role="toolbar"
      className={cn("group/actions flex items-center gap-0.5", className)}
      {...props}
    >
      {children}
    </div>
  )
);
Actions.displayName = "Actions";

export interface ActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Accessible label for the icon button. Used as the `aria-label` and, unless
   * `tooltip` is provided, as the tooltip text.
   */
  label: string;
  /** Click handler for the action. */
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  /**
   * Tooltip text shown on hover/focus. Defaults to `label`. Pass `null` to
   * suppress the tooltip entirely while keeping the accessible label.
   */
  tooltip?: React.ReactNode;
  /** Icon (or any node) rendered inside the button. */
  children: React.ReactNode;
  /**
   * When false, the action stays at full opacity instead of revealing on the
   * parent `Actions` row's hover/focus. Defaults to true.
   */
  revealOnHover?: boolean;
}

/**
 * A single tooltipped icon button for an `Actions` row.
 *
 * Renders a ghost-styled square button wrapped in a `Tooltip`. When sitting
 * inside an `Actions` row it fades in on the row's hover/focus by default; set
 * `revealOnHover={false}` to keep it always visible (e.g. a primary action).
 *
 * Self-contained: it provides its own `TooltipProvider`, so a single `Action`
 * works without any surrounding provider.
 */
const Action = React.forwardRef<HTMLButtonElement, ActionProps>(
  (
    {
      label,
      tooltip,
      onClick,
      children,
      className,
      revealOnHover = true,
      type = "button",
      ...props
    },
    ref
  ) => {
    const button = (
      <Button
        ref={ref}
        type={type}
        variant="ghost"
        size="icon"
        aria-label={label}
        onClick={onClick}
        className={cn(
          "text-muted-foreground hover:bg-accent-muted hover:text-foreground size-7 rounded-sm transition-[color,background-color,opacity] [&_svg]:size-4 [&_svg]:shrink-0",
          revealOnHover &&
            "opacity-0 focus-visible:opacity-100 group-focus-within/actions:opacity-100 group-hover/actions:opacity-100",
          className
        )}
        {...props}
      >
        {children}
      </Button>
    );

    // `tooltip === null` opts out; otherwise default to the accessible label.
    const tooltipContent = tooltip === undefined ? label : tooltip;
    if (tooltipContent === null) {
      return button;
    }

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>{tooltipContent}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
);
Action.displayName = "Action";

export { Actions, Action };

export { Actions as default };
