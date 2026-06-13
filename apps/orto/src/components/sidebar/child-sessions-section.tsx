"use client";

import { Badge, CollapsibleSection } from "@orthogonal/ui";
import Link from "next/link";
import useSWR from "swr";

import type { SessionItem } from "@/components/session-sidebar";
import { formatRelativeTime } from "@/lib/time";

interface ChildSessionsSectionProps {
  sessionId: string;
}

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "failed", "archived"]);

function statusBadgeVariant(status: string) {
  switch (status) {
    case "active":
    case "running":
      return "info" as const;
    case "completed":
      return "pr-merged" as const;
    case "cancelled":
    case "failed":
      return "pr-closed" as const;
    default:
      return "default" as const;
  }
}

export function ChildSessionsSection({ sessionId }: ChildSessionsSectionProps) {
  const { data } = useSWR<{ children: SessionItem[] }>(`/api/sessions/${sessionId}/children`, {
    // Primary refresh is event-driven via WebSocket child_session_update → SWR mutate().
    // This is a safety-net fallback for missed WS messages during reconnections.
    refreshInterval: (latestData) => {
      if (!latestData?.children?.length) return 0;
      const hasActiveChild = latestData.children.some((c) => !TERMINAL_STATUSES.has(c.status));
      return hasActiveChild ? 30_000 : 0;
    },
  });

  const children = data?.children;
  if (!children?.length) return null;

  return (
    <CollapsibleSection title="Sub-tasks" defaultOpen={true}>
      <div className="space-y-2">
        {children.map((child) => (
          <Link
            key={child.id}
            href={`/session/${child.id}`}
            className="block rounded p-2 transition-colors hover:bg-muted"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelativeTime(child.updatedAt || child.createdAt)}
                </span>
                <span className="truncate text-sm">
                  {child.title || `${child.repoOwner}/${child.repoName}`}
                </span>
              </div>
              <Badge variant={statusBadgeVariant(child.status)} className="shrink-0">
                {child.status}
              </Badge>
            </div>
          </Link>
        ))}
      </div>
    </CollapsibleSection>
  );
}
