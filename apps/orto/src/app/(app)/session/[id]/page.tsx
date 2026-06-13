"use client";

import { DEFAULT_MODEL, getDefaultReasoningEffort, type ModelCategory } from "@open-inspect/shared";
import {
  Button,
  CheckIcon,
  Combobox,
  type ComboboxGroup,
  CopyIcon,
  ErrorIcon,
  MediaLightbox,
  ModelIcon,
  SafeMarkdown,
  ScreenshotArtifactCard,
  SendIcon,
  SidebarIcon,
  StopIcon,
} from "@orthogonal/ui";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  memo,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
} from "react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { mutate } from "swr";
import useSWRMutation from "swr/mutation";

import { ActionBar } from "@/components/action-bar";
import { ReasoningEffortPills } from "@/components/reasoning-effort-pills";
import {
  SessionRightSidebar,
  SessionRightSidebarContent,
} from "@/components/session-right-sidebar";
import { useSidebarContext } from "@/components/sidebar-layout";
import { TerminalPanel } from "@/components/terminal-panel";
import { ToolCallGroup } from "@/components/tool-call-group";
import { useEnabledModels } from "@/hooks/use-enabled-models";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSessionSocket } from "@/hooks/use-session-socket";
import { archiveSession } from "@/lib/archive-session";
import { copyToClipboard, formatModelNameLower } from "@/lib/format";
import { SHORTCUT_LABELS } from "@/lib/keyboard-shortcuts";
import { buildSessionMediaUrl } from "@/lib/media";
import {
  isArchivedSessionListKey,
  isUnarchivedSessionListKey,
  removeSessionFromList,
  type SessionListResponse,
} from "@/lib/session-list";
import type { Artifact, SandboxEvent } from "@/types/session";

type ToolCallEvent = Extract<SandboxEvent, { type: "tool_call" }>;
// Event grouping types
type EventGroup =
  | { type: "tool_group"; events: ToolCallEvent[]; id: string }
  | { type: "single"; event: SandboxEvent; id: string };

type SessionState = ReturnType<typeof useSessionSocket>["sessionState"];

type FallbackSessionInfo = {
  repoOwner: string | null;
  repoName: string | null;
  title: string | null;
};

// Group consecutive tool calls of the same type
function groupEvents(events: SandboxEvent[]): EventGroup[] {
  const groups: EventGroup[] = [];
  let currentToolGroup: ToolCallEvent[] = [];
  let groupIndex = 0;

  const flushToolGroup = () => {
    if (currentToolGroup.length > 0) {
      groups.push({
        type: "tool_group",
        events: [...currentToolGroup],
        id: `tool-group-${groupIndex++}`,
      });
      currentToolGroup = [];
    }
  };

  for (const event of events) {
    if (event.type === "tool_call") {
      // Check if same tool as current group
      if (currentToolGroup.length > 0 && currentToolGroup[0].tool === event.tool) {
        currentToolGroup.push(event);
      } else {
        // Flush previous group and start new one
        flushToolGroup();
        currentToolGroup = [event];
      }
    } else {
      // Flush any tool group before non-tool event
      flushToolGroup();
      groups.push({
        type: "single",
        event,
        id: `single-${event.type}-${("messageId" in event ? event.messageId : undefined) || event.timestamp}-${groupIndex++}`,
      });
    }
  }

  // Flush final group
  flushToolGroup();

  return groups;
}

function dedupeAndGroupEvents(events: SandboxEvent[]): EventGroup[] {
  const filteredEvents: Array<SandboxEvent | null> = [];
  const seenToolCalls = new Map<string, number>();
  const seenCompletions = new Set<string>();
  const seenTokens = new Map<string, number>();

  for (const event of events) {
    if (event.type === "tool_call" && event.callId) {
      // Deduplicate tool_call events by callId - keep the latest (most complete) one
      const existingIdx = seenToolCalls.get(event.callId);
      if (existingIdx !== undefined) {
        filteredEvents[existingIdx] = event;
      } else {
        seenToolCalls.set(event.callId, filteredEvents.length);
        filteredEvents.push(event);
      }
    } else if (event.type === "execution_complete" && event.messageId) {
      // Skip duplicate execution_complete for the same message
      if (!seenCompletions.has(event.messageId)) {
        seenCompletions.add(event.messageId);
        filteredEvents.push(event);
      }
    } else if (event.type === "token" && event.messageId) {
      // Deduplicate tokens by messageId - keep latest at its chronological position
      const existingIdx = seenTokens.get(event.messageId);
      if (existingIdx !== undefined) {
        filteredEvents[existingIdx] = null;
      }
      seenTokens.set(event.messageId, filteredEvents.length);
      filteredEvents.push(event);
    } else {
      // All other events (user_message, git_sync, etc.) - add as-is
      filteredEvents.push(event);
    }
  }

  return groupEvents(filteredEvents.filter((event): event is SandboxEvent => event !== null));
}

function resolveSessionDisplayInfo(
  sessionState: SessionState,
  fallbackSessionInfo: FallbackSessionInfo
): {
  repoLabel: string;
  title: string;
} {
  const resolvedRepoOwner = sessionState?.repoOwner ?? fallbackSessionInfo.repoOwner;
  const resolvedRepoName = sessionState?.repoName ?? fallbackSessionInfo.repoName;
  const repoLabel =
    resolvedRepoOwner && resolvedRepoName
      ? `${resolvedRepoOwner}/${resolvedRepoName}`
      : "Loading session...";

  return {
    repoLabel,
    title: sessionState?.title || fallbackSessionInfo.title || repoLabel,
  };
}

export default function SessionPage() {
  return (
    <Suspense>
      <SessionPageContent />
    </Suspense>
  );
}

function SessionPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = params.id as string;

  const {
    connected,
    connecting,
    replaying,
    authError,
    connectionError,
    sessionState,
    events,
    participants,
    artifacts,
    currentParticipantId,
    isProcessing,
    loadingHistory,
    sendPrompt,
    stopExecution,
    sendTyping,
    reconnect,
    loadOlderEvents,
  } = useSessionSocket(sessionId);

  const fallbackSessionInfo = useMemo(
    () => ({
      repoOwner: searchParams.get("repoOwner") || null,
      repoName: searchParams.get("repoName") || null,
      title: searchParams.get("title") || null,
    }),
    [searchParams]
  );

  const { trigger: triggerRename } = useSWRMutation(
    `/api/sessions/${sessionId}/title`,
    (url: string, { arg }: { arg: { title: string } }) =>
      fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: arg.title }),
      }).then((r) => {
        if (r.ok) return true;
        console.error("Failed to update session title");
        return false;
      }),
    { throwOnError: false }
  );

  const handleArchive = useCallback(async () => {
    const didArchive = await archiveSession(sessionId);
    if (didArchive) {
      await mutate<SessionListResponse>(
        isUnarchivedSessionListKey,
        (current) =>
          current
            ? { ...current, sessions: removeSessionFromList(current.sessions, sessionId) }
            : current,
        { revalidate: false, populateCache: true }
      );
      router.push("/");
    }
  }, [router, sessionId]);

  const renameSession = useCallback(
    async (title: string) => {
      const updatedAt = Date.now();
      const updateSessionsTitle = (data?: SessionListResponse): SessionListResponse | undefined => {
        if (!data?.sessions) return data;
        return {
          ...data,
          sessions: data.sessions.map((session) =>
            session.id === sessionId ? { ...session, title, updatedAt } : session
          ),
        };
      };

      try {
        const success = await triggerRename({ title });
        if (!success) {
          throw new Error("Failed to update session title");
        }
        await mutate<SessionListResponse>(isUnarchivedSessionListKey, updateSessionsTitle, {
          populateCache: true,
          revalidate: true,
        });
        await mutate<SessionListResponse>(isArchivedSessionListKey, updateSessionsTitle, {
          populateCache: true,
          revalidate: false,
        });
        return true;
      } catch {
        return false;
      }
    },
    [sessionId, triggerRename]
  );

  const { trigger: handleUnarchive } = useSWRMutation(
    `/api/sessions/${sessionId}/unarchive`,
    (url: string) =>
      fetch(url, { method: "POST" }).then(async (r) => {
        if (r.ok) {
          await mutate<SessionListResponse>(
            isArchivedSessionListKey,
            (current) =>
              current
                ? { ...current, sessions: removeSessionFromList(current.sessions, sessionId) }
                : current,
            { revalidate: false, populateCache: true }
          );
          mutate(isUnarchivedSessionListKey);
        } else {
          console.error("Failed to unarchive session");
        }
      }),
    { throwOnError: false }
  );

  const [prompt, setPrompt] = useState("");
  const [selectedMediaArtifactId, setSelectedMediaArtifactId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL);
  const [reasoningEffort, setReasoningEffort] = useState<string | undefined>(
    getDefaultReasoningEffort(DEFAULT_MODEL)
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { enabledModels, enabledModelOptions } = useEnabledModels();

  const handleModelChange = useCallback((model: string) => {
    setSelectedModel(model);
    setReasoningEffort(getDefaultReasoningEffort(model));
  }, []);

  // Reset to default if the selected model is no longer enabled
  useEffect(() => {
    if (enabledModels.length > 0 && !enabledModels.includes(selectedModel)) {
      const fallback = enabledModels[0] ?? DEFAULT_MODEL;
      setSelectedModel(fallback);
      setReasoningEffort(getDefaultReasoningEffort(fallback));
    }
  }, [enabledModels, selectedModel]);

  // Sync selectedModel and reasoningEffort with session state when it loads
  useEffect(() => {
    if (sessionState?.model) {
      setSelectedModel(sessionState.model);
      setReasoningEffort(
        sessionState.reasoningEffort ?? getDefaultReasoningEffort(sessionState.model)
      );
    }
  }, [sessionState?.model, sessionState?.reasoningEffort]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isProcessing) return;

    sendPrompt(prompt, selectedModel, reasoningEffort);
    setPrompt("");
    // Revalidate sidebar so this session bubbles to the top
    mutate(isUnarchivedSessionListKey);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;

    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);

    // Send typing indicator (debounced)
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping();
    }, 300);
  };

  return (
    <SessionContent
      sessionState={sessionState}
      connected={connected}
      connecting={connecting}
      replaying={replaying}
      authError={authError}
      connectionError={connectionError}
      reconnect={reconnect}
      participants={participants}
      events={events}
      artifacts={artifacts}
      currentParticipantId={currentParticipantId}
      messagesEndRef={messagesEndRef}
      prompt={prompt}
      isProcessing={isProcessing}
      selectedModel={selectedModel}
      reasoningEffort={reasoningEffort}
      inputRef={inputRef}
      handleSubmit={handleSubmit}
      handleInputChange={handleInputChange}
      handleKeyDown={handleKeyDown}
      setSelectedModel={handleModelChange}
      setReasoningEffort={setReasoningEffort}
      stopExecution={stopExecution}
      handleArchive={handleArchive}
      handleUnarchive={handleUnarchive}
      renameSession={renameSession}
      loadingHistory={loadingHistory}
      loadOlderEvents={loadOlderEvents}
      modelOptions={enabledModelOptions}
      fallbackSessionInfo={fallbackSessionInfo}
      sessionId={sessionId}
      selectedMediaArtifactId={selectedMediaArtifactId}
      setSelectedMediaArtifactId={setSelectedMediaArtifactId}
    />
  );
}

function SessionContent({
  sessionState,
  connected,
  connecting,
  replaying,
  authError,
  connectionError,
  reconnect,
  participants,
  events,
  artifacts,
  currentParticipantId,
  messagesEndRef,
  prompt,
  isProcessing,
  selectedModel,
  reasoningEffort,
  inputRef,
  handleSubmit,
  handleInputChange,
  handleKeyDown,
  setSelectedModel,
  setReasoningEffort,
  stopExecution,
  handleArchive,
  handleUnarchive,
  renameSession,
  loadingHistory,
  loadOlderEvents,
  modelOptions,
  fallbackSessionInfo,
  sessionId,
  selectedMediaArtifactId,
  setSelectedMediaArtifactId,
}: {
  sessionState: SessionState;
  connected: boolean;
  connecting: boolean;
  replaying: boolean;
  authError: string | null;
  connectionError: string | null;
  reconnect: () => void;
  participants: ReturnType<typeof useSessionSocket>["participants"];
  events: ReturnType<typeof useSessionSocket>["events"];
  artifacts: ReturnType<typeof useSessionSocket>["artifacts"];
  currentParticipantId: string | null;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  prompt: string;
  isProcessing: boolean;
  selectedModel: string;
  reasoningEffort: string | undefined;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  handleSubmit: (e: React.FormEvent) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  setSelectedModel: (model: string) => void;
  setReasoningEffort: (value: string | undefined) => void;
  stopExecution: () => void;
  handleArchive: () => void | Promise<void>;
  handleUnarchive: () => void | Promise<void>;
  renameSession: (title: string) => Promise<boolean | undefined>;
  loadingHistory: boolean;
  loadOlderEvents: () => void;
  modelOptions: ModelCategory[];
  fallbackSessionInfo: FallbackSessionInfo;
  sessionId: string;
  selectedMediaArtifactId: string | null;
  setSelectedMediaArtifactId: (artifactId: string | null) => void;
}) {
  const { isOpen, toggle } = useSidebarContext();
  const isBelowLg = useMediaQuery("(max-width: 1023px)");
  const isPhone = useMediaQuery("(max-width: 767px)");
  const resolvedRepoOwner = sessionState?.repoOwner ?? fallbackSessionInfo.repoOwner;
  const resolvedRepoName = sessionState?.repoName ?? fallbackSessionInfo.repoName;
  const fallbackRepoLabel =
    resolvedRepoOwner && resolvedRepoName
      ? `${resolvedRepoOwner}/${resolvedRepoName}`
      : "Loading session...";
  const baseResolvedTitle = sessionState?.title ?? fallbackSessionInfo.title ?? fallbackRepoLabel;

  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [title, setTitle] = useState(baseResolvedTitle);
  const [optimisticTitle, setOptimisticTitle] = useState<string | null>(null);
  const [sheetDragY, setSheetDragY] = useState(0);
  const sheetDragYRef = useRef(0);
  const detailsButtonRef = useRef<HTMLButtonElement>(null);
  const sheetTouchStartYRef = useRef<number | null>(null);

  // Terminal panel state
  const [terminalOpen, setTerminalOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("terminal-visible") === "true";
  });
  const toggleTerminal = useCallback(() => {
    setTerminalOpen((prev) => {
      const next = !prev;
      localStorage.setItem("terminal-visible", String(next));
      return next;
    });
  }, []);
  const closeTerminal = useCallback(() => {
    setTerminalOpen(false);
    localStorage.setItem("terminal-visible", "false");
  }, []);
  const ttydUrl = sessionState?.ttydUrl;
  const ttydToken = sessionState?.ttydToken;
  const showTerminal = !!(ttydUrl && ttydToken && terminalOpen && !isBelowLg);

  // Scroll pagination refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  const isPrependingRef = useRef(false);
  const prevScrollHeightRef = useRef(0);
  const isNearBottomRef = useRef(true);

  const resetSheetDragState = useCallback(() => {
    setSheetDragY(0);
    sheetDragYRef.current = 0;
  }, []);

  const closeDetails = useCallback(() => {
    setIsDetailsOpen(false);
    resetSheetDragState();
    detailsButtonRef.current?.focus();
  }, [resetSheetDragState]);

  const toggleDetails = useCallback(() => {
    setIsDetailsOpen((prev) => {
      const next = !prev;
      if (!next) {
        resetSheetDragState();
      }
      return next;
    });
  }, [resetSheetDragState]);

  const handleStartRename = () => {
    setTitle(resolvedTitle);
    setIsRenaming(true);
  };

  const handleRenameSubmit = async () => {
    if (!sessionState) {
      setIsRenaming(false);
      return;
    }

    const trimmed = title.trim();

    if (!trimmed || trimmed === resolvedTitle) {
      setIsRenaming(false);
      return;
    }

    const previousTitle = resolvedTitle;
    setIsRenaming(false);
    setOptimisticTitle(trimmed);

    const success = await renameSession(trimmed);
    if (!success) {
      setOptimisticTitle(null);
      setTitle(previousTitle);
      setIsRenaming(true);
    }
  };

  const resolvedTitle =
    optimisticTitle ?? sessionState?.title ?? fallbackSessionInfo.title ?? fallbackRepoLabel;

  useEffect(() => {
    if (!optimisticTitle) return;
    if (sessionState?.title === optimisticTitle) {
      setOptimisticTitle(null);
    }
  }, [optimisticTitle, sessionState?.title]);

  const handleSheetTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const startY = event.touches[0]?.clientY;
    sheetTouchStartYRef.current = startY ?? null;
  }, []);

  const handleSheetTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const startY = sheetTouchStartYRef.current;
    const currentY = event.touches[0]?.clientY;

    if (startY === null || currentY === undefined) return;

    const delta = currentY - startY;
    if (delta > 0) {
      const nextDragY = Math.min(delta, 180);
      sheetDragYRef.current = nextDragY;
      setSheetDragY(nextDragY);
    } else {
      sheetDragYRef.current = 0;
      setSheetDragY(0);
    }
  }, []);

  const handleSheetTouchEnd = useCallback(() => {
    if (sheetDragYRef.current > 100) {
      closeDetails();
      sheetTouchStartYRef.current = null;
      return;
    }

    sheetDragYRef.current = 0;
    setSheetDragY(0);
    sheetTouchStartYRef.current = null;
  }, [closeDetails]);

  useEffect(() => {
    if (!isRenaming) setTitle(sessionState?.title ?? "");
  }, [sessionState?.title, isRenaming]);

  useEffect(() => {
    if (isBelowLg) return;
    setIsDetailsOpen(false);
    resetSheetDragState();
  }, [isBelowLg, resetSheetDragState]);

  useEffect(() => {
    if (!isDetailsOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDetails();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeDetails, isDetailsOpen]);

  useEffect(() => {
    if (!isDetailsOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isDetailsOpen]);

  // Track user scroll
  const handleScroll = useCallback(() => {
    hasScrolledRef.current = true;
    const el = scrollContainerRef.current;
    if (el) {
      isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    }
  }, []);

  // IntersectionObserver to trigger loading older events
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          entry.isIntersecting &&
          hasScrolledRef.current &&
          container.scrollHeight > container.clientHeight
        ) {
          // Capture scroll height BEFORE triggering load
          prevScrollHeightRef.current = container.scrollHeight;
          isPrependingRef.current = true;
          loadOlderEvents();
        }
      },
      { root: container, threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadOlderEvents]);

  // Maintain scroll position when older events are prepended
  useLayoutEffect(() => {
    if (isPrependingRef.current && scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      el.scrollTop += el.scrollHeight - prevScrollHeightRef.current;
      isPrependingRef.current = false;
    }
  }, [events]);

  // Auto-scroll to bottom only when near bottom (not when prepending older history)
  useEffect(() => {
    if (isNearBottomRef.current && !isPrependingRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [events, messagesEndRef]);

  // Deduplicate and group events for rendering
  const groupedEvents = useMemo(() => dedupeAndGroupEvents(events), [events]);
  const mediaArtifacts = useMemo(
    () =>
      artifacts.filter((artifact) => artifact.type === "screenshot" || artifact.type === "video"),
    [artifacts]
  );
  const selectedMediaArtifact = useMemo(
    () => mediaArtifacts.find((artifact) => artifact.id === selectedMediaArtifactId) ?? null,
    [mediaArtifacts, selectedMediaArtifactId]
  );

  const sessionDisplayInfo = useMemo(
    () => resolveSessionDisplayInfo(sessionState, fallbackSessionInfo),
    [fallbackSessionInfo, sessionState]
  );
  const showTimelineSkeleton = events.length === 0 && (connecting || replaying);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border-muted">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {!isOpen && (
              <Button
                variant="ghost"
                size="icon"
                onClick={toggle}
                title={`Open sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
                aria-label={`Open sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
              >
                <SidebarIcon className="h-4 w-4" />
              </Button>
            )}
            <div>
              {isRenaming ? (
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={handleRenameSubmit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                    if (e.key === "Escape") {
                      setIsRenaming(false);
                    }
                  }}
                  className="max-w-40 truncate bg-transparent text-sm font-medium text-foreground outline-none focus:ring-inset focus:ring-ring"
                />
              ) : (
                <h1
                  className="max-w-40 cursor-text truncate text-sm font-medium text-foreground"
                  onClick={handleStartRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleStartRename();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  title="Click to rename"
                >
                  {resolvedTitle}
                </h1>
              )}
              <p className="text-sm text-muted-foreground">{sessionDisplayInfo.repoLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              ref={detailsButtonRef}
              type="button"
              onClick={toggleDetails}
              className="border border-border-muted px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground lg:hidden"
              aria-label="Toggle session details"
              aria-controls="session-details-dialog"
              aria-expanded={isDetailsOpen}
            >
              Details
            </button>
            {/* Mobile: single combined status dot */}
            <div className="md:hidden">
              <CombinedStatusDot
                connected={connected}
                connecting={connecting}
                sandboxStatus={sessionState?.sandboxStatus}
              />
            </div>
            {/* Desktop: full status indicators */}
            <div className="hidden md:contents">
              <ConnectionStatus connected={connected} connecting={connecting} />
              <SandboxStatus
                status={sessionState?.sandboxStatus}
                dashboardUrl={sessionState?.sandboxDashboardUrl}
              />
              <ParticipantsList participants={participants} />
            </div>
          </div>
        </div>
      </header>

      {/* Connection error banner */}
      {(authError || connectionError) && (
        <div className="flex items-center justify-between border-b border-destructive-border bg-destructive-muted px-4 py-3">
          <p className="text-sm text-destructive">{authError || connectionError}</p>
          <button
            onClick={reconnect}
            className="hover:bg-destructive/90 bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground transition"
          >
            Reconnect
          </button>
        </div>
      )}

      {/* Main content */}
      <main className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          <PanelGroup orientation="vertical" id="session-terminal">
            {/* Chat / Event Timeline */}
            <Panel defaultSize={showTerminal ? "70%" : "100%"} minSize="30%">
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="h-full overflow-y-auto overflow-x-hidden p-4"
              >
                <div className="mx-auto max-w-3xl space-y-2">
                  {/* Scroll sentinel for loading older history */}
                  <div ref={topSentinelRef} className="h-1" />
                  {loadingHistory && (
                    <div className="py-2 text-center text-sm text-muted-foreground">Loading...</div>
                  )}
                  {showTimelineSkeleton ? (
                    <TimelineSkeleton />
                  ) : (
                    groupedEvents.map((group) =>
                      group.type === "tool_group" ? (
                        <ToolCallGroup key={group.id} events={group.events} groupId={group.id} />
                      ) : (
                        <EventItem
                          key={group.id}
                          event={group.event}
                          sessionId={sessionId}
                          currentParticipantId={currentParticipantId}
                          onOpenMedia={setSelectedMediaArtifactId}
                        />
                      )
                    )
                  )}
                  {isProcessing && <ThinkingIndicator />}

                  <div ref={messagesEndRef} />
                </div>
              </div>
            </Panel>

            {/* Terminal panel — only rendered when URL + token available and open */}
            {showTerminal && (
              <>
                <PanelResizeHandle className="h-1.5 cursor-row-resize bg-border-muted transition-colors hover:bg-accent" />
                <Panel defaultSize="30%" minSize="15%" maxSize="70%">
                  <TerminalPanel url={ttydUrl!} token={ttydToken!} onClose={closeTerminal} />
                </Panel>
              </>
            )}
          </PanelGroup>
        </div>

        {/* Right sidebar */}
        <SessionRightSidebar
          sessionId={sessionId}
          sessionState={sessionState}
          participants={participants}
          events={events}
          artifacts={artifacts}
          terminalOpen={terminalOpen}
          onToggleTerminal={toggleTerminal}
          onOpenMedia={setSelectedMediaArtifactId}
        />
      </main>

      {isBelowLg && (
        <div
          className={`fixed inset-0 z-50 lg:hidden ${isDetailsOpen ? "" : "pointer-events-none"}`}
        >
          <div
            className={`absolute inset-0 bg-overlay transition-opacity duration-200 ${
              isDetailsOpen ? "opacity-100" : "opacity-0"
            }`}
            onClick={closeDetails}
          />

          {isPhone ? (
            <div
              id="session-details-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Session details"
              className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col border-t border-border-muted bg-background shadow-xl"
              style={{
                transform: isDetailsOpen ? `translateY(${sheetDragY}px)` : "translateY(100%)",
                transition: sheetDragY > 0 ? "none" : "transform 200ms ease-in-out",
              }}
            >
              <div
                className="border-b border-border-muted px-4 pb-2 pt-3"
                onTouchStart={handleSheetTouchStart}
                onTouchMove={handleSheetTouchMove}
                onTouchEnd={handleSheetTouchEnd}
                onTouchCancel={handleSheetTouchEnd}
              >
                <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-muted" />
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-foreground">Session details</h2>
                  <button
                    type="button"
                    onClick={closeDetails}
                    className="text-sm text-muted-foreground transition hover:text-foreground"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto">
                <SessionRightSidebarContent
                  sessionId={sessionId}
                  sessionState={sessionState}
                  participants={participants}
                  events={events}
                  artifacts={artifacts}
                  terminalOpen={terminalOpen}
                  onToggleTerminal={toggleTerminal}
                  onOpenMedia={setSelectedMediaArtifactId}
                />
              </div>
            </div>
          ) : (
            <div
              id="session-details-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Session details"
              className="absolute inset-y-0 right-0 flex w-80 max-w-[85vw] flex-col border-l border-border-muted bg-background shadow-xl transition-transform duration-200 ease-in-out"
              style={{ transform: isDetailsOpen ? "translateX(0)" : "translateX(100%)" }}
            >
              <div className="flex items-center justify-between border-b border-border-muted px-4 py-3">
                <h2 className="text-sm font-medium text-foreground">Session details</h2>
                <button
                  type="button"
                  onClick={closeDetails}
                  className="text-sm text-muted-foreground transition hover:text-foreground"
                >
                  Close
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <SessionRightSidebarContent
                  sessionId={sessionId}
                  sessionState={sessionState}
                  participants={participants}
                  events={events}
                  artifacts={artifacts}
                  terminalOpen={terminalOpen}
                  onToggleTerminal={toggleTerminal}
                  onOpenMedia={setSelectedMediaArtifactId}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <MediaLightbox
        src={
          selectedMediaArtifact ? buildSessionMediaUrl(sessionId, selectedMediaArtifact.id) : null
        }
        type={selectedMediaArtifact?.type === "video" ? "video" : "image"}
        title={selectedMediaArtifact?.metadata?.caption}
        description={selectedMediaArtifact?.metadata?.sourceUrl}
        open={selectedMediaArtifactId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedMediaArtifactId(null);
          }
        }}
      />

      {/* Input */}
      <footer className="flex-shrink-0 border-t border-border-muted">
        <form onSubmit={handleSubmit} className="mx-auto max-w-4xl p-4 pb-6">
          {/* Action bar above input */}
          <div className="mb-3">
            <ActionBar
              sessionId={sessionState?.id || ""}
              sessionStatus={sessionState?.status || ""}
              artifacts={artifacts}
              onArchive={handleArchive}
              onUnarchive={handleUnarchive}
            />
          </div>

          {/* Input container */}
          <div className="border border-border bg-input">
            {/* Text input area with floating send button */}
            <div className="relative">
              <textarea
                ref={inputRef}
                value={prompt}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={isProcessing ? "Type your next message..." : "Ask or build anything"}
                className="w-full resize-none bg-transparent px-4 pb-12 pt-4 text-foreground placeholder:text-secondary-foreground focus:outline-none"
                rows={3}
              />
              {/* Floating action buttons */}
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                {isProcessing && prompt.trim() && (
                  <span className="text-xs text-warning">Waiting...</span>
                )}
                {isProcessing && (
                  <button
                    type="button"
                    onClick={stopExecution}
                    className="p-2 text-destructive transition hover:bg-destructive-muted"
                    title="Stop"
                  >
                    <StopIcon className="h-5 w-5" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!prompt.trim() || isProcessing}
                  className="p-2 text-secondary-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                  title={
                    isProcessing && prompt.trim()
                      ? "Wait for execution to complete"
                      : `Send (${SHORTCUT_LABELS.SEND_PROMPT})`
                  }
                  aria-label={
                    isProcessing && prompt.trim()
                      ? "Wait for execution to complete"
                      : `Send (${SHORTCUT_LABELS.SEND_PROMPT})`
                  }
                >
                  <SendIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Footer row with model selector, reasoning pills, and agent label */}
            <div className="flex flex-col gap-2 border-t border-border-muted px-4 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
              {/* Left side - Model selector + Reasoning pills */}
              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-4">
                <Combobox
                  value={selectedModel}
                  onChange={setSelectedModel}
                  items={
                    modelOptions.map((group) => ({
                      category: group.category,
                      options: group.models.map((model) => ({
                        value: model.id,
                        label: model.name,
                        description: model.description,
                      })),
                    })) as ComboboxGroup[]
                  }
                  direction="up"
                  dropdownWidth="w-56"
                  disabled={isProcessing}
                  triggerClassName="flex max-w-full items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <ModelIcon className="h-3.5 w-3.5" />
                  <span className="max-w-[9rem] truncate sm:max-w-none">
                    {formatModelNameLower(selectedModel)}
                  </span>
                </Combobox>

                {/* Reasoning effort pills */}
                <ReasoningEffortPills
                  selectedModel={selectedModel}
                  reasoningEffort={reasoningEffort}
                  onSelect={setReasoningEffort}
                  disabled={isProcessing}
                />
              </div>

              {/* Right side - Agent label */}
              <span className="hidden text-sm text-muted-foreground sm:inline">build agent</span>
            </div>
          </div>
        </form>
      </footer>
    </div>
  );
}

function ConnectionStatus({ connected, connecting }: { connected: boolean; connecting: boolean }) {
  if (connecting) {
    return (
      <span className="flex items-center gap-1 text-xs text-warning">
        <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
        Connecting...
      </span>
    );
  }

  if (connected) {
    return (
      <span className="flex items-center gap-1 text-xs text-success">
        <span className="h-2 w-2 rounded-full bg-success" />
        Connected
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 text-xs text-destructive">
      <span className="h-2 w-2 rounded-full bg-destructive" />
      Disconnected
    </span>
  );
}

function SandboxStatus({
  status,
  dashboardUrl,
}: {
  status?: string;
  dashboardUrl?: string | null;
}) {
  if (!status) return null;

  const colors: Record<string, string> = {
    pending: "text-muted-foreground",
    warming: "text-warning",
    syncing: "text-accent",
    ready: "text-success",
    running: "text-accent",
    stopped: "text-muted-foreground",
    failed: "text-destructive",
  };

  const className = `text-xs ${colors[status] || colors.pending}`;
  const label = `Sandbox: ${status}`;

  if (dashboardUrl) {
    return (
      <a
        href={dashboardUrl}
        target="_blank"
        rel="noreferrer noopener"
        title="Open sandbox in provider dashboard"
        className={`${className} hover:underline`}
      >
        {label}
        <span aria-hidden="true" className="ml-0.5">
          ↗
        </span>
      </a>
    );
  }

  return <span className={className}>{label}</span>;
}

function CombinedStatusDot({
  connected,
  connecting,
  sandboxStatus,
}: {
  connected: boolean;
  connecting: boolean;
  sandboxStatus?: string;
}) {
  let color: string;
  let pulse = false;
  let label: string;

  if (!connected && !connecting) {
    color = "bg-destructive";
    label = "Disconnected";
  } else if (connecting) {
    color = "bg-warning";
    pulse = true;
    label = "Connecting...";
  } else if (sandboxStatus === "failed") {
    color = "bg-destructive";
    label = `Connected \u00b7 Sandbox: ${sandboxStatus}`;
  } else if (["pending", "warming", "syncing"].includes(sandboxStatus || "")) {
    color = "bg-warning";
    label = `Connected \u00b7 Sandbox: ${sandboxStatus}`;
  } else {
    color = "bg-success";
    label = sandboxStatus ? `Connected \u00b7 Sandbox: ${sandboxStatus}` : "Connected";
  }

  return (
    <span title={label} className="flex items-center">
      <span className={`h-2.5 w-2.5 rounded-full ${color}${pulse ? " animate-pulse" : ""}`} />
    </span>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 bg-card p-4">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
      <span className="text-sm text-muted-foreground">Thinking...</span>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="animate-pulse space-y-3 py-2">
      <div className="space-y-2 bg-card p-4">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-5/6 rounded bg-muted" />
      </div>
      <div className="ml-8 space-y-2 bg-accent-muted p-4">
        <div className="h-3 w-20 rounded bg-muted" />
        <div className="h-3 w-4/5 rounded bg-muted" />
      </div>
      <div className="space-y-2 bg-card p-4">
        <div className="h-3 w-32 rounded bg-muted" />
        <div className="h-3 w-3/4 rounded bg-muted" />
      </div>
    </div>
  );
}

function ParticipantsList({
  participants,
}: {
  participants: { userId: string; name: string; status: string }[];
}) {
  if (participants.length === 0) return null;

  // Deduplicate participants by userId (same user may have multiple connections)
  const uniqueParticipants = Array.from(new Map(participants.map((p) => [p.userId, p])).values());

  return (
    <div className="flex -space-x-2">
      {uniqueParticipants.slice(0, 3).map((p) => (
        <div
          key={p.userId}
          className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-card text-xs font-medium text-foreground"
          title={p.name}
        >
          {p.name.charAt(0).toUpperCase()}
        </div>
      ))}
      {uniqueParticipants.length > 3 && (
        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-muted text-xs font-medium text-foreground">
          +{uniqueParticipants.length - 3}
        </div>
      )}
    </div>
  );
}

const EventItem = memo(function EventItem({
  event,
  sessionId,
  currentParticipantId,
  onOpenMedia,
}: {
  event: SandboxEvent;
  sessionId: string;
  currentParticipantId: string | null;
  onOpenMedia: (artifactId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const time = new Date(event.timestamp * 1000).toLocaleTimeString();

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyContent = useCallback(async (content: string) => {
    const success = await copyToClipboard(content);
    if (!success) return;

    setCopied(true);
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = setTimeout(() => {
      setCopied(false);
      copyTimeoutRef.current = null;
    }, 1500);
  }, []);

  switch (event.type) {
    case "user_message": {
      // Display user's prompt with correct author attribution
      if (!event.content) return null;
      const messageContent = event.content;

      // Determine if this message is from the current user
      const isCurrentUser =
        event.author?.participantId && currentParticipantId
          ? event.author.participantId === currentParticipantId
          : !event.author; // Messages without author are assumed to be from current user (local)

      const authorName = isCurrentUser ? "You" : event.author?.name || "Unknown User";

      return (
        <div className="group ml-8 bg-accent-muted p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!isCurrentUser && event.author?.avatar && (
                <img src={event.author.avatar} alt={authorName} className="h-5 w-5 rounded-full" />
              )}
              <span className="text-xs text-accent">{authorName}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleCopyContent(messageContent)}
                className="hover:bg-muted/60 pointer-events-none p-1 text-secondary-foreground opacity-0 transition-colors hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                title={copied ? "Copied" : "Copy markdown"}
                aria-label={copied ? "Copied" : "Copy markdown"}
              >
                {copied ? (
                  <CheckIcon className="h-3.5 w-3.5" />
                ) : (
                  <CopyIcon className="h-3.5 w-3.5" />
                )}
              </button>
              <span className="text-xs text-secondary-foreground">{time}</span>
            </div>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-foreground">{messageContent}</pre>
        </div>
      );
    }

    case "token": {
      // Display the model's text response with safe markdown rendering
      if (!event.content) return null;
      const messageContent = event.content;
      return (
        <div className="group bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Assistant</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleCopyContent(messageContent)}
                className="pointer-events-none p-1 text-secondary-foreground opacity-0 transition-colors hover:bg-muted hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                title={copied ? "Copied" : "Copy markdown"}
                aria-label={copied ? "Copied" : "Copy markdown"}
              >
                {copied ? (
                  <CheckIcon className="h-3.5 w-3.5" />
                ) : (
                  <CopyIcon className="h-3.5 w-3.5" />
                )}
              </button>
              <span className="text-xs text-secondary-foreground">{time}</span>
            </div>
          </div>
          <SafeMarkdown content={messageContent} className="text-sm" />
        </div>
      );
    }

    case "tool_call":
      // Tool calls are handled by ToolCallGroup component
      return null;

    case "tool_result":
      // Tool results are now shown inline with tool calls
      // Only show standalone results if they're errors
      if (!event.error) return null;
      return (
        <div className="flex items-center gap-2 py-1 text-sm text-destructive">
          <ErrorIcon className="h-4 w-4" />
          <span className="truncate">{event.error}</span>
          <span className="ml-auto text-xs text-secondary-foreground">{time}</span>
        </div>
      );

    case "git_sync":
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-accent" />
          Git sync: {event.status}
          <span className="text-xs">{time}</span>
        </div>
      );

    case "artifact":
      if (
        (event.artifactType !== "screenshot" && event.artifactType !== "video") ||
        !event.artifactId
      ) {
        return null;
      }

      return (
        <div className="space-y-2 border border-border-muted bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {event.artifactType === "video" ? "Video" : "Screenshot"}
            </span>
            <span className="text-xs text-secondary-foreground">{time}</span>
          </div>
          <ScreenshotArtifactCard
            artifactId={event.artifactId}
            src={buildSessionMediaUrl(sessionId, event.artifactId)}
            isVideo={event.artifactType === "video"}
            caption={(event.metadata as Artifact["metadata"] | undefined)?.caption}
            sourceUrl={(event.metadata as Artifact["metadata"] | undefined)?.sourceUrl}
            onOpen={onOpenMedia}
          />
        </div>
      );

    case "error":
      return (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <span className="h-2 w-2 rounded-full bg-destructive" />
          Error{event.error ? `: ${event.error}` : ""}
          <span className="text-xs text-secondary-foreground">{time}</span>
        </div>
      );

    case "execution_complete":
      if (event.success === false) {
        return (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <span className="h-2 w-2 rounded-full bg-destructive" />
            Execution failed{event.error ? `: ${event.error}` : ""}
            <span className="text-xs text-secondary-foreground">{time}</span>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2 text-sm text-success">
          <span className="h-2 w-2 rounded-full bg-success" />
          Execution complete
          <span className="text-xs text-secondary-foreground">{time}</span>
        </div>
      );

    default:
      return null;
  }
});
