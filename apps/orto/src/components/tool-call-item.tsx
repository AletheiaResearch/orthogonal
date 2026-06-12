"use client";

import {
  ChevronRightIcon,
  FileIcon,
  PencilIcon,
  PlusIcon,
  TerminalIcon,
  SearchIcon,
  FolderIcon,
  BoxIcon,
  GlobeIcon,
} from "@/components/ui/icons";
import { formatSessionEventTime } from "@/lib/time";
import { formatToolCall } from "@/lib/tool-formatters";
import type { SandboxEvent } from "@/types/session";

import { SlackNotifyEvent } from "./slack-notify-event";

interface ToolCallItemProps {
  event: Extract<SandboxEvent, { type: "tool_call" }>;
  isExpanded: boolean;
  onToggle: () => void;
  showTime?: boolean;
}

function ToolIcon({ name }: { name: string | null }) {
  if (!name) return null;

  const iconClass = "w-3.5 h-3.5 text-secondary-foreground";

  switch (name) {
    case "file":
      return <FileIcon className={iconClass} />;
    case "pencil":
      return <PencilIcon className={iconClass} />;
    case "plus":
      return <PlusIcon className={iconClass} />;
    case "terminal":
      return <TerminalIcon className={iconClass} />;
    case "search":
      return <SearchIcon className={iconClass} />;
    case "folder":
      return <FolderIcon className={iconClass} />;
    case "box":
      return <BoxIcon className={iconClass} />;
    case "globe":
      return <GlobeIcon className={iconClass} />;
    default:
      return null;
  }
}

export function ToolCallItem({ event, isExpanded, onToggle, showTime = true }: ToolCallItemProps) {
  if (event.tool === "slack-notify") {
    return (
      <SlackNotifyEvent
        event={event}
        isExpanded={isExpanded}
        onToggle={onToggle}
        showTime={showTime}
      />
    );
  }

  const formatted = formatToolCall(event);
  const isApplyPatch = event.tool?.toLowerCase() === "apply_patch";
  const time = formatSessionEventTime(event.timestamp);

  const { args, output } = formatted.getDetails();
  const patchText = isApplyPatch && typeof args?.patchText === "string" ? args.patchText : null;
  const nonPatchArgs =
    isApplyPatch && args
      ? Object.fromEntries(Object.entries(args).filter(([key]) => key !== "patchText"))
      : args;
  const hasNonPatchArgs = !!nonPatchArgs && Object.keys(nonPatchArgs).length > 0;

  return (
    <div className="py-0.5">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRightIcon
          className={`h-3.5 w-3.5 text-secondary-foreground transition-transform duration-200 ${
            isExpanded ? "rotate-90" : ""
          }`}
        />
        <ToolIcon name={formatted.icon} />
        <span className="truncate">
          {formatted.toolName} {formatted.summary}
        </span>
        {showTime && (
          <span className="ml-auto flex-shrink-0 text-xs text-secondary-foreground">{time}</span>
        )}
      </button>

      {isExpanded && (
        <div className="ml-5 mt-2 overflow-hidden border border-border-muted bg-card p-3 text-xs">
          {hasNonPatchArgs && (
            <div className="mb-2">
              <div className="mb-1 font-medium text-muted-foreground">Arguments:</div>
              <pre className="overflow-x-auto whitespace-pre-wrap text-foreground">
                {JSON.stringify(nonPatchArgs, null, 2)}
              </pre>
            </div>
          )}
          {patchText && (
            <div className="mb-2">
              <div className="mb-1 font-medium text-muted-foreground">Patch:</div>
              <pre className="max-h-64 overflow-x-auto whitespace-pre-wrap text-foreground">
                {patchText}
              </pre>
            </div>
          )}
          {output && (
            <div>
              <div className="mb-1 font-medium text-muted-foreground">Output:</div>
              <pre className="max-h-48 overflow-x-auto whitespace-pre-wrap text-foreground">
                {output}
              </pre>
            </div>
          )}
          {!hasNonPatchArgs && !patchText && !output && (
            <span className="text-secondary-foreground">No details available</span>
          )}
        </div>
      )}
    </div>
  );
}
