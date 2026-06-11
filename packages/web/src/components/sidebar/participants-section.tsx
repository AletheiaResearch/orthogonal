"use client";

import type { ParticipantPresence } from "@open-inspect/shared";

interface ParticipantsSectionProps {
  participants: ParticipantPresence[];
}

export function ParticipantsSection({ participants }: ParticipantsSectionProps) {
  if (participants.length === 0) return null;

  const count = participants.length;
  const label = count === 1 ? "prompt engineer" : "prompt engineers";

  return (
    <div className="flex items-center gap-2">
      {/* Avatar stack */}
      <div className="flex -space-x-2">
        {participants.slice(0, 4).map((participant) => (
          <div key={participant.participantId} className="relative" title={participant.name}>
            {participant.avatar ? (
              <img
                src={participant.avatar}
                alt={participant.name}
                className="h-6 w-6 rounded-full border-2 border-white object-cover"
              />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-card text-xs font-medium text-foreground">
                {participant.name.charAt(0).toUpperCase()}
              </div>
            )}
            {/* Status indicator */}
            {participant.status === "active" && (
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-white bg-success" />
            )}
          </div>
        ))}
      </div>
      {/* Count label */}
      <span className="text-sm text-muted-foreground">
        {count} {label}
      </span>
    </div>
  );
}
