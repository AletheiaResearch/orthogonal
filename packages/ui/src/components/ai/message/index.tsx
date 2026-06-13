import * as React from "react";

import { cn } from "../../../lib/utils";

/**
 * Message — a single chat turn (avatar + content bubble + optional header/footer).
 *
 * This is a fully presentational, protocol-agnostic primitive in the AI-Elements tradition: it
 * knows nothing about any agent/session shape. Styling and layout key off the {@link MessageProps.from}
 * role only. Compose a header, footer, timestamp, or actions simply by nesting children — no extra
 * props are required.
 *
 * Pure props → JSX (no hooks, handlers, or browser APIs), so it is safe to render on the server.
 */

type MessageRole = "user" | "assistant" | "system";

export interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The author of this turn. Drives alignment, ordering, and bubble tone. */
  from: MessageRole;
  /** Turn content — typically a {@link MessageAvatar} plus a {@link MessageContent}. */
  children?: React.ReactNode;
  /** Extra classes merged onto the row container via `cn`. */
  className?: string;
}

/**
 * Row container for one chat turn. User turns align to the trailing edge with the avatar last;
 * assistant and system turns align to the leading edge with the avatar first.
 */
export function Message({ from, children, className, ...props }: MessageProps) {
  const isUser = from === "user";

  return (
    <div
      data-from={from}
      className={cn(
        "flex w-full items-start gap-3",
        // User turns mirror so the avatar sits on the trailing edge after the bubble.
        isUser ? "flex-row-reverse" : "flex-row",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

type MessageContentVariant = "contained" | "flat";

export interface MessageContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The rendered turn body — text, markdown, tool output, etc. */
  children?: React.ReactNode;
  /**
   * Bubble treatment.
   * - `contained` (default): a rounded, filled bubble with a subtle border.
   * - `flat`: no background or border, for dense or full-width layouts.
   */
  variant?: MessageContentVariant;
  /** Extra classes merged onto the content container via `cn`. */
  className?: string;
}

/**
 * The content bubble for a turn. Designed to sit inside a {@link Message}; place it as the sibling of
 * a {@link MessageAvatar}. The warm, muted bubble matches the orto aesthetic.
 */
export function MessageContent({
  children,
  variant = "contained",
  className,
  ...props
}: MessageContentProps) {
  return (
    <div
      data-variant={variant}
      className={cn(
        "text-foreground min-w-0 flex-1 text-sm leading-relaxed",
        variant === "contained" && "border-border-muted bg-muted rounded-lg border px-4 py-3",
        variant === "flat" && "py-1",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface MessageAvatarProps extends Omit<
  React.HTMLAttributes<HTMLSpanElement>,
  "children"
> {
  /** Image URL. When present an `<img>` is rendered; otherwise initials/fallback are shown. */
  src?: string;
  /** Author name. Used as the image alt text and to derive initials when no `src`/`fallback` is set. */
  name?: string;
  /** Explicit fallback text (e.g. "AI") shown when no `src` is provided. Overrides derived initials. */
  fallback?: string;
  /** Extra classes merged onto the avatar container via `cn`. */
  className?: string;
}

/** Derive up to two uppercase initials from a display name. Pure — no state. */
function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * A small, circular avatar for a chat turn. Renders the image at {@link MessageAvatarProps.src} when
 * provided; otherwise shows {@link MessageAvatarProps.fallback}, then initials derived from
 * {@link MessageAvatarProps.name}. Plain url/initials only — no loading or error state.
 */
export function MessageAvatar({ src, name, fallback, className, ...props }: MessageAvatarProps) {
  const alt = name ?? "avatar";
  const text = fallback ?? (name ? initialsFromName(name) : "");

  return (
    <span
      className={cn(
        "border-border bg-accent-muted text-accent flex size-8 shrink-0 select-none items-center justify-center overflow-hidden rounded-full border text-xs font-medium",
        className
      )}
      {...props}
    >
      {src ? (
        <img src={src} alt={alt} className="size-full object-cover" />
      ) : (
        <span aria-hidden={!name && !fallback}>{text}</span>
      )}
    </span>
  );
}

export { Message as default };
