"use client";

import { useEffect, useState } from "react";

import { cn } from "../../../lib/utils";

interface ScreenshotArtifactCardProps {
  /** Identifier passed back through {@link onOpen} when the card is activated. */
  artifactId: string;
  /** Resolved URL of the media to render (image or video source). */
  src: string;
  /** Whether the media is a video; renders a `<video>` with a play indicator instead of an `<img>`. */
  isVideo?: boolean;
  /** Accessible label and visible caption for the media. Falls back to a sensible default. */
  caption?: string;
  /** Optional origin URL shown beneath the caption (hidden in compact mode). */
  sourceUrl?: string;
  /** Invoked with {@link artifactId} when the user activates the card. */
  onOpen: (artifactId: string) => void;
  /** Additional classes merged onto the card container via `cn`. */
  className?: string;
  /** Tightens padding and hides the source URL for dense layouts. */
  compact?: boolean;
}

export function ScreenshotArtifactCard({
  artifactId,
  src,
  isVideo = false,
  caption,
  sourceUrl,
  onOpen,
  className,
  compact = false,
}: ScreenshotArtifactCardProps) {
  const resolvedCaption = caption || (isVideo ? "Video recording" : "Screenshot");
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
  }, [src]);

  return (
    <div className={cn("border-border-muted bg-card overflow-hidden border", className)}>
      <button
        type="button"
        onClick={() => onOpen(artifactId)}
        className="block w-full text-left"
        aria-label={resolvedCaption}
      >
        <div className="bg-muted relative aspect-[16/10] overflow-hidden">
          {!hasError && isVideo ? (
            <video
              src={src}
              aria-label={`${resolvedCaption} video preview`}
              className={cn(
                "h-full w-full object-cover transition-transform duration-200 hover:scale-[1.01]",
                !isLoaded && "invisible"
              )}
              muted
              playsInline
              preload="metadata"
              onLoadedMetadata={() => setIsLoaded(true)}
              onError={() => {
                setHasError(true);
                setIsLoaded(false);
              }}
            />
          ) : !hasError ? (
            <img
              src={src}
              alt={resolvedCaption}
              className={cn(
                "h-full w-full object-cover transition-transform duration-200 hover:scale-[1.01]",
                !isLoaded && "invisible"
              )}
              loading="lazy"
              onLoad={() => setIsLoaded(true)}
              onError={() => {
                setHasError(true);
                setIsLoaded(false);
              }}
            />
          ) : null}
          {isVideo && !hasError && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="bg-background/80 text-foreground flex h-10 w-10 items-center justify-center rounded-full shadow-sm">
                <span className="ml-0.5 h-0 w-0 border-y-[7px] border-l-[11px] border-y-transparent border-l-current" />
              </span>
            </div>
          )}
          {!isLoaded && (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              {hasError ? "Preview unavailable" : `Loading ${isVideo ? "video" : "screenshot"}...`}
            </div>
          )}
        </div>
      </button>

      <div className={cn("space-y-1 p-3", compact && "p-2")}>
        <p className="text-foreground line-clamp-2 text-sm">{resolvedCaption}</p>
        {!compact && sourceUrl && (
          <p className="text-muted-foreground truncate text-xs">{sourceUrl}</p>
        )}
      </div>
    </div>
  );
}

export { ScreenshotArtifactCard as default };
