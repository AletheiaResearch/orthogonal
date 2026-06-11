"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";

import { buildSessionHref, type SessionItem } from "@/components/session-sidebar";
import { Button } from "@/components/ui/button";
import {
  isUnarchivedSessionListKey,
  removeSessionFromList,
  type SessionListResponse,
} from "@/lib/session-list";
import { formatRelativeTime } from "@/lib/time";

const PAGE_SIZE = 20;
const ARCHIVED_SESSIONS_KEY = `/api/sessions?status=archived&limit=${PAGE_SIZE}&offset=0`;

export function DataControlsSettings() {
  const [extraSessions, setExtraSessions] = useState<SessionItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const { data, isLoading: loading } = useSWR<SessionListResponse>(ARCHIVED_SESSIONS_KEY, {
    onSuccess: (data) => {
      const fetched = data.sessions || [];
      setHasMore(fetched.length === PAGE_SIZE);
      setOffset(fetched.length);
      setExtraSessions([]);
    },
  });

  const firstPageSessions = data?.sessions ?? [];
  const sessions = [...firstPageSessions, ...extraSessions];

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/sessions?status=archived&limit=${PAGE_SIZE}&offset=${offset}`);
      if (res.ok) {
        const resData = await res.json();
        const fetched: SessionItem[] = resData.sessions || [];
        setExtraSessions((prev) => [...prev, ...fetched]);
        setHasMore(fetched.length === PAGE_SIZE);
        setOffset((prev) => prev + fetched.length);
      }
    } catch (error) {
      console.error("Failed to fetch archived sessions:", error);
    } finally {
      setLoadingMore(false);
    }
  }, [offset]);

  const handleUnarchive = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/unarchive`, { method: "POST" });
      if (!res.ok) {
        toast.error("Failed to unarchive session");
        return;
      }
      toast.success("Session unarchived");
      await mutate<SessionListResponse>(
        ARCHIVED_SESSIONS_KEY,
        (current) =>
          current
            ? { ...current, sessions: removeSessionFromList(current.sessions, sessionId) }
            : current,
        { revalidate: false, populateCache: true }
      );
      setExtraSessions((prev) => prev.filter((s) => s.id !== sessionId));
      // Server-side list shifts down by one, so the next Load more must
      // start one offset earlier to avoid skipping the session that took
      // this row's slot.
      setOffset((prev) => prev - 1);
      mutate(isUnarchivedSessionListKey);
    } catch {
      toast.error("Failed to unarchive session");
    }
  };

  const sessionCount = sessions.length;

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-foreground">Data Controls</h2>
      <p className="mb-6 text-sm text-muted-foreground">Manage your archived chats and data.</p>

      <div>
        <h3 className="mb-1 text-base font-medium text-foreground">Archived chats</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          {loading
            ? "Loading..."
            : sessionCount === 0
              ? "No archived sessions"
              : `${sessionCount}${hasMore ? "+" : ""} archived session${sessionCount !== 1 ? "s" : ""}`}
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No archived sessions. Sessions you archive will appear here.
          </div>
        ) : (
          <div className="divide-y divide-border-muted rounded-md border border-border">
            {sessions.map((session) => (
              <ArchivedSessionRow
                key={session.id}
                session={session}
                onUnarchive={handleUnarchive}
              />
            ))}
          </div>
        )}

        {hasMore && !loading && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="mt-4 w-full"
          >
            {loadingMore ? "Loading..." : "Load more"}
          </Button>
        )}
      </div>
    </div>
  );
}

function ArchivedSessionRow({
  session,
  onUnarchive,
}: {
  session: SessionItem;
  onUnarchive: (id: string) => void;
}) {
  const displayTitle = session.title || `${session.repoOwner}/${session.repoName}`;
  const repoInfo = `${session.repoOwner}/${session.repoName}`;
  const timestamp = session.updatedAt || session.createdAt;
  const relativeTime = formatRelativeTime(timestamp);
  return (
    <div className="group flex items-center justify-between px-4 py-3 transition hover:bg-muted">
      <Link href={buildSessionHref(session)} className="mr-3 min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{displayTitle}</div>
        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <span>{relativeTime}</span>
          <span>&middot;</span>
          <span className="truncate">{repoInfo}</span>
        </div>
      </Link>
      <Button
        variant="outline"
        size="xs"
        onClick={() => onUnarchive(session.id)}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100"
      >
        Unarchive
      </Button>
    </div>
  );
}
