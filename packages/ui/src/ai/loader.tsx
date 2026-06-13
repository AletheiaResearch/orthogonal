import { Loader2 } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/utils";

/**
 * Loader — a lightweight, decoupled set of inline loading/streaming indicators for the
 * @orthogonal/ui/ai layer.
 *
 * Two purely presentational primitives:
 *   - {@link Loader}      a spinning indicator (lucide `Loader2` + `animate-spin`)
 *   - {@link TextShimmer} an animated shimmer-text variant for transient status copy
 *                         like "Thinking…" or "Connecting…"
 *
 * Both are server-safe: they take only props and render JSX (no hooks, event handlers, or
 * browser APIs), so no `"use client"` directive is required.
 */

const SHIMMER_KEYFRAMES_ID = "orthogonal-ui-text-shimmer-keyframes";

/**
 * Static keyframes for the shimmer sweep. Injected via a `<style>` element so the effect works
 * without touching the shared Tailwind config. Each instance emits the same block; the content is
 * identical and the keyframe name is stable, so repeated definitions are harmless.
 */
const SHIMMER_KEYFRAMES = `@keyframes ${SHIMMER_KEYFRAMES_ID} {
  0% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}`;

/** Default spinner size in pixels. */
const DEFAULT_SIZE_PX = 16;

export interface LoaderProps extends Omit<
  React.SVGProps<SVGSVGElement>,
  "width" | "height" | "size"
> {
  /** Diameter of the spinner in pixels. Defaults to {@link DEFAULT_SIZE_PX}. */
  size?: number;
  /** Extra Tailwind classes merged onto the spinner via `cn`. */
  className?: string;
}

/**
 * A minimal spinning loading indicator. Inherits `currentColor` so it adopts the surrounding text
 * color by default; pass `text-muted-foreground`, `text-accent`, etc. via `className` to retint it.
 *
 * The `size` prop maps to lucide's native sizing (sets both `width` and `height`).
 */
export function Loader({ size = DEFAULT_SIZE_PX, className, ...props }: LoaderProps) {
  return (
    <Loader2
      role="status"
      aria-label="Loading"
      size={size}
      className={cn("text-muted-foreground animate-spin", className)}
      {...props}
    />
  );
}

export interface TextShimmerProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** The text (or inline nodes) to animate with the shimmer sweep. */
  children: React.ReactNode;
  /** Extra Tailwind classes merged onto the shimmer span via `cn`. */
  className?: string;
}

/**
 * A shimmer-text indicator for transient, in-progress status copy ("Thinking…", "Connecting…").
 *
 * Renders the text in `text-muted-foreground` with a brighter `text-foreground`-toned highlight
 * sweeping across it. Uses `bg-clip-text` + a repeating linear-gradient background driven by the
 * locally-injected keyframes, so it needs no Tailwind config changes and stays server-safe.
 */
export function TextShimmer({ children, className, style, ...props }: TextShimmerProps) {
  return (
    <>
      <style>{SHIMMER_KEYFRAMES}</style>
      <span
        className={cn("inline-block bg-clip-text font-medium text-transparent", className)}
        style={{
          backgroundImage:
            "linear-gradient(90deg, var(--muted-foreground) 0%, var(--muted-foreground) 35%, var(--foreground) 50%, var(--muted-foreground) 65%, var(--muted-foreground) 100%)",
          backgroundSize: "200% 100%",
          animation: `${SHIMMER_KEYFRAMES_ID} 2s linear infinite`,
          ...style,
        }}
        {...props}
      >
        {children}
      </span>
    </>
  );
}
