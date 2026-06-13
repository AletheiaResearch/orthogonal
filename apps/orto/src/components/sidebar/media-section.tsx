"use client";

import { ScreenshotArtifactCard } from "@orthogonal/ui";

import { buildSessionMediaUrl } from "@/lib/media";
import type { Artifact } from "@/types/session";

interface MediaSectionProps {
  sessionId: string;
  mediaArtifacts: Artifact[];
  onOpenMedia: (artifactId: string) => void;
}

export function MediaSection({ sessionId, mediaArtifacts, onOpenMedia }: MediaSectionProps) {
  if (mediaArtifacts.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3">
      {mediaArtifacts.map((artifact) => (
        <ScreenshotArtifactCard
          key={artifact.id}
          artifactId={artifact.id}
          src={buildSessionMediaUrl(sessionId, artifact.id)}
          isVideo={artifact.type === "video"}
          caption={artifact.metadata?.caption}
          sourceUrl={artifact.metadata?.sourceUrl}
          onOpen={onOpenMedia}
          compact={true}
        />
      ))}
    </div>
  );
}
