"use client";

import { AlertTriangleIcon, ExternalLinkIcon, GlobeIcon, RotateCwIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";

import { cn } from "../../../lib/utils";

/**
 * Default sandbox flags applied to the preview iframe when no `sandbox` prop is
 * supplied. Allows scripts, same-origin access, popups, and form submission —
 * enough for most embedded web apps while still isolating the frame.
 */
export const DEFAULT_WEB_PREVIEW_SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-forms";

/**
 * Returns `src` only when it is a safe, navigable web URL (http/https), and
 * `undefined` otherwise. Guards the host-page "open in new tab" anchor and the
 * iframe against unsafe schemes (e.g. `javascript:`/`data:`) that could execute
 * in the host origin when the `src` is derived from agent/tool output.
 */
function toSafeWebUrl(src: string): string | undefined {
  try {
    const { protocol } = new URL(src, "http://localhost");
    return protocol === "http:" || protocol === "https:" ? src : undefined;
  } catch {
    return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/*                            WebPreviewNavigation                            */
/* -------------------------------------------------------------------------- */

interface WebPreviewNavigationProps {
  /** Leading content — typically a label/icon describing the previewed page. */
  children?: ReactNode;
  /** Trailing content — typically action buttons (open-in-new-tab, close). */
  actions?: ReactNode;
  /** Additional classes merged onto the toolbar container via `cn`. */
  className?: string;
}

/**
 * The toolbar row that sits above a {@link WebPreviewBody}. A presentational
 * slot: pass label content as `children` and action controls as `actions`.
 */
export function WebPreviewNavigation({ children, actions, className }: WebPreviewNavigationProps) {
  return (
    <div
      className={cn(
        "border-border-muted bg-muted/50 flex items-center justify-between gap-2 border-b px-3 py-1.5",
        className
      )}
    >
      <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-sm">
        {children}
      </div>
      {actions ? <div className="flex flex-shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               WebPreviewBody                               */
/* -------------------------------------------------------------------------- */

interface WebPreviewBodyProps {
  /** Resolved URL to load in the iframe. */
  src: string;
  /** Accessible title for the iframe. */
  title?: string;
  /** Id of an external element labelling the iframe, wired to `aria-labelledby`. */
  labelledBy?: string;
  /** Space-separated iframe `sandbox` flags. Defaults to {@link DEFAULT_WEB_PREVIEW_SANDBOX}. */
  sandbox?: string;
  /** Space-separated iframe feature-policy string for the `allow` attribute. */
  allow?: string;
  /** Overlay shown while the frame is loading. Falls back to a default spinner row. */
  loadingNode?: ReactNode;
  /** Overlay shown when the frame fails to load. Falls back to a default error row. */
  errorNode?: ReactNode;
  /** Additional classes merged onto the body container via `cn`. */
  className?: string;
}

/**
 * The sandboxed iframe surface with loading and error overlays. Tracks load
 * state internally and resets whenever `src` changes.
 */
export function WebPreviewBody({
  src,
  title = "Web preview",
  labelledBy,
  sandbox = DEFAULT_WEB_PREVIEW_SANDBOX,
  allow,
  loadingNode,
  errorNode,
  className,
}: WebPreviewBodyProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const safeSrc = useMemo(() => toSafeWebUrl(src), [src]);

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
  }, [src]);

  return (
    <div className={cn("bg-background relative flex-1 overflow-hidden", className)}>
      {isLoading && !hasError ? (
        <div className="bg-background absolute inset-0 z-10 flex items-center justify-center">
          {loadingNode ?? (
            <span className="text-muted-foreground flex items-center gap-2 text-sm">
              <RotateCwIcon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Loading preview...
            </span>
          )}
        </div>
      ) : null}
      {hasError ? (
        <div className="bg-background absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-4 text-center">
          {errorNode ?? (
            <>
              <AlertTriangleIcon className="text-muted-foreground h-5 w-5" aria-hidden="true" />
              <span className="text-foreground text-sm">This page could not be loaded.</span>
              <span className="text-muted-foreground text-xs">
                Check the URL or try opening it in a new tab.
              </span>
            </>
          )}
        </div>
      ) : null}
      <iframe
        src={safeSrc}
        title={title}
        aria-labelledby={labelledBy}
        className="bg-background h-full w-full border-0"
        sandbox={sandbox}
        allow={allow}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 WebPreview                                 */
/* -------------------------------------------------------------------------- */

interface WebPreviewProps {
  /** Resolved URL to embed. Pass a fully-formed src — this primitive is protocol-agnostic. */
  src: string;
  /** Label shown in the toolbar and used as the iframe's accessible title. Defaults to the src. */
  title?: string;
  /** Space-separated iframe `sandbox` flags. Defaults to {@link DEFAULT_WEB_PREVIEW_SANDBOX}. */
  sandbox?: string;
  /** Space-separated iframe feature-policy string for the `allow` attribute. */
  allow?: string;
  /** When provided, renders a close button in the toolbar that invokes this callback. */
  onClose?: () => void;
  /** Overlay shown while the frame is loading. Falls back to a default spinner row. */
  loadingNode?: ReactNode;
  /** Overlay shown when the frame fails to load. Falls back to a default error row. */
  errorNode?: ReactNode;
  /** Additional classes merged onto the root container via `cn`. */
  className?: string;
}

/**
 * A self-contained embedded web preview panel: a labelled toolbar with
 * open-in-new-tab and optional close actions sitting above a sandboxed iframe
 * with loading and error overlays.
 *
 * Decoupled by design — it takes a resolved `src` and render-prop overlays, and
 * has no knowledge of any session/agent/auth protocol. For custom layouts,
 * compose {@link WebPreviewNavigation} and {@link WebPreviewBody} directly.
 */
export function WebPreview({
  src,
  title,
  sandbox,
  allow,
  onClose,
  loadingNode,
  errorNode,
  className,
}: WebPreviewProps) {
  const labelId = useId();
  const label = title ?? src;
  const safeHref = useMemo(() => toSafeWebUrl(src), [src]);

  return (
    <div
      className={cn(
        "bg-background text-foreground flex h-full flex-col overflow-hidden",
        className
      )}
    >
      <WebPreviewNavigation
        actions={
          <>
            {safeHref ? (
              <a
                href={safeHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:bg-accent-muted hover:text-foreground rounded-sm p-1 transition-colors"
                title="Open in new tab"
                aria-label="Open in new tab"
              >
                <ExternalLinkIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : null}
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="text-muted-foreground hover:bg-accent-muted hover:text-foreground rounded-sm p-1 transition-colors"
                title="Close preview"
                aria-label="Close preview"
              >
                <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </>
        }
      >
        <GlobeIcon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span id={labelId} className="truncate font-medium" title={label}>
          {label}
        </span>
      </WebPreviewNavigation>

      <WebPreviewBody
        src={src}
        title={label}
        labelledBy={labelId}
        sandbox={sandbox}
        allow={allow}
        loadingNode={loadingNode}
        errorNode={errorNode}
      />
    </div>
  );
}

export { WebPreview as default };
