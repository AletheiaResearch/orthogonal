"use client";

import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../overlay/dialog";

interface MediaLightboxProps {
  /** The resolved media URL to display, or null when nothing is selected. */
  src: string | null;
  /** The kind of media. Defaults to "image" when omitted. */
  type?: "image" | "video";
  /** Heading shown above the media. Falls back to a type-derived label. */
  title?: string;
  /** Supporting text shown beneath the title. Falls back to a type-derived label. */
  description?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MediaLightbox({
  src,
  type,
  title,
  description,
  open,
  onOpenChange,
}: MediaLightboxProps) {
  const isVideo = type === "video";
  const caption = title || (isVideo ? "Video recording" : "Screenshot");
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
  }, [src, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border-muted bg-background max-w-[min(96vw,1100px)] gap-4 p-4">
        <DialogTitle>{caption}</DialogTitle>
        <DialogDescription>
          {description || (isVideo ? "Session video recording" : "Session screenshot")}
        </DialogDescription>

        <div className="bg-muted max-h-[80vh] overflow-auto">
          {!src ? (
            <div className="text-muted-foreground flex min-h-[320px] items-center justify-center text-sm">
              No media selected
            </div>
          ) : (
            <>
              {!hasError && src && isVideo ? (
                <video
                  src={src}
                  aria-label={`${caption} video`}
                  className={isLoaded ? "mx-auto h-auto max-h-[76vh] max-w-full" : "invisible"}
                  controls
                  preload="metadata"
                  onLoadedMetadata={() => setIsLoaded(true)}
                  onError={() => {
                    setHasError(true);
                    setIsLoaded(false);
                  }}
                />
              ) : !hasError && src ? (
                <img
                  src={src}
                  alt={caption}
                  className={isLoaded ? "mx-auto h-auto max-w-full object-contain" : "invisible"}
                  onLoad={() => setIsLoaded(true)}
                  onError={() => {
                    setHasError(true);
                    setIsLoaded(false);
                  }}
                />
              ) : null}
              {isVideo && !isLoaded && (
                <div className="text-muted-foreground flex min-h-[320px] items-center justify-center text-sm">
                  {hasError ? "Preview unavailable" : "Loading video..."}
                </div>
              )}
              {!isVideo && !isLoaded && (
                <div className="text-muted-foreground flex min-h-[320px] items-center justify-center text-sm">
                  {hasError ? "Preview unavailable" : "Loading screenshot..."}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
