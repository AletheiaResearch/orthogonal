"use client";

import { ChevronDown, CircleCheck, CircleDashed, LoaderCircle } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/utils";

/** Lifecycle of a single step in an agent's plan. */
export type TaskStatus = "pending" | "in-progress" | "completed";

interface TaskContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
}

const TaskContext = React.createContext<TaskContextValue | null>(null);

function useTaskContext(component: string): TaskContextValue {
  const context = React.useContext(TaskContext);
  if (!context) {
    throw new Error(`<${component}> must be rendered inside a <Task>.`);
  }
  return context;
}

export interface TaskProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Optional title rendered when no `TaskTrigger` child is provided. */
  title?: React.ReactNode;
  /** Initial open state when uncontrolled. Defaults to `true`. */
  defaultOpen?: boolean;
  /** Controlled open state. When set, the component is controlled. */
  open?: boolean;
  /** Fires whenever the open state should change (controlled or not). */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Collapsible surface for an agent's to-do list / plan. Compose with
 * `TaskTrigger` (the header) and `TaskContent` (the body of `TaskItem`s).
 * Supports both controlled (`open` + `onOpenChange`) and uncontrolled
 * (`defaultOpen`) usage.
 */
export function Task({
  title,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  className,
  children,
  ...props
}: TaskProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  const contextValue = React.useMemo<TaskContextValue>(() => ({ open, setOpen }), [open, setOpen]);

  return (
    <TaskContext.Provider value={contextValue}>
      <div
        className={cn(
          "border-border bg-background text-foreground w-full overflow-hidden rounded-md border",
          className
        )}
        {...props}
      >
        {title !== undefined ? <TaskTrigger title={title} /> : null}
        {children}
      </div>
    </TaskContext.Provider>
  );
}

export interface TaskTriggerProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "title"
> {
  /** Label shown in the header — usually the plan's overall goal. */
  title: React.ReactNode;
  /** Overall status of the task, surfaced as an icon beside the title. */
  status?: TaskStatus;
}

/**
 * Clickable header that toggles the surrounding `Task` open and closed. It
 * mirrors the open state from context to rotate its chevron and set the right
 * ARIA attributes.
 */
export function TaskTrigger({ title, status, className, onClick, ...props }: TaskTriggerProps) {
  const { open, setOpen } = useTaskContext("TaskTrigger");

  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          setOpen(!open);
        }
      }}
      className={cn(
        "text-foreground hover:bg-accent-muted focus-visible:ring-accent flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2",
        className
      )}
      {...props}
    >
      {status ? <TaskStatusIcon status={status} className="shrink-0" /> : null}
      <span className="flex-1 truncate">{title}</span>
      <ChevronDown
        aria-hidden="true"
        className={cn(
          "text-muted-foreground size-4 shrink-0 transition-transform duration-200",
          open && "rotate-180"
        )}
      />
    </button>
  );
}

export interface TaskContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

/**
 * Body of a `Task`. Renders its children (typically `TaskItem`s) only while the
 * surrounding `Task` is open.
 */
export function TaskContent({ className, children, ...props }: TaskContentProps) {
  const { open } = useTaskContext("TaskContent");

  if (!open) {
    return null;
  }

  return (
    <div
      className={cn(
        "border-border-muted flex flex-col gap-1.5 border-t px-3 py-2.5 text-sm",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface TaskItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Lifecycle state of this individual step. */
  status: TaskStatus;
  children?: React.ReactNode;
}

/**
 * A single step in the plan. The leading icon and text emphasis reflect
 * `status`: pending is muted, in-progress shows a spinner, completed is checked.
 */
export function TaskItem({ status, className, children, ...props }: TaskItemProps) {
  return (
    <div
      data-status={status}
      className={cn(
        "flex items-start gap-2 leading-relaxed",
        status === "completed" && "text-muted-foreground",
        status === "pending" && "text-muted-foreground",
        status === "in-progress" && "text-foreground",
        className
      )}
      {...props}
    >
      <TaskStatusIcon status={status} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

export interface TaskItemFileProps extends React.HTMLAttributes<HTMLSpanElement> {
  children?: React.ReactNode;
}

/**
 * Inline chip referencing a file mentioned by a `TaskItem`. Render an icon
 * before the filename as a child for a richer chip.
 */
export function TaskItemFile({ className, children, ...props }: TaskItemFileProps) {
  return (
    <span
      className={cn(
        "border-border bg-muted text-foreground inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 align-middle font-mono text-xs",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

interface TaskStatusIconProps {
  status: TaskStatus;
  className?: string;
}

/** Maps a `TaskStatus` to its themed lucide icon. Internal helper. */
function TaskStatusIcon({ status, className }: TaskStatusIconProps) {
  if (status === "completed") {
    return <CircleCheck aria-hidden="true" className={cn("text-success size-4", className)} />;
  }

  if (status === "in-progress") {
    return (
      <LoaderCircle
        aria-hidden="true"
        className={cn("text-accent size-4 animate-spin", className)}
      />
    );
  }

  return (
    <CircleDashed aria-hidden="true" className={cn("text-muted-foreground size-4", className)} />
  );
}
