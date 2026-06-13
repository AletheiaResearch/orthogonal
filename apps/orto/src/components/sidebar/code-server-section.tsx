"use client";

import type { SandboxStatus } from "@open-inspect/shared";
import { TerminalIcon, KeyIcon, CheckIcon } from "@orthogonal/ui";
import { useState } from "react";

import { copyToClipboard } from "@/lib/format";
import { getSafeExternalUrl } from "@/lib/urls";

import { ACTIVE_SANDBOX_STATUSES } from "./sandbox-statuses";

interface CodeServerSectionProps {
  url: string;
  password: string | null;
  sandboxStatus: SandboxStatus;
}
const STARTING_STATUSES: Set<SandboxStatus> = new Set([
  "pending",
  "spawning",
  "connecting",
  "warming",
  "syncing",
]);

export function CodeServerSection({ url, password, sandboxStatus }: CodeServerSectionProps) {
  const [copiedPassword, setCopiedPassword] = useState(false);

  const isActive = ACTIVE_SANDBOX_STATUSES.has(sandboxStatus);
  const isStarting = STARTING_STATUSES.has(sandboxStatus);
  const safeUrl = getSafeExternalUrl(url);

  const handleCopyPassword = async () => {
    if (!password) return;
    const success = await copyToClipboard(password);
    if (success) {
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    }
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <TerminalIcon
        className={`h-4 w-4 shrink-0 ${isActive && safeUrl ? "text-muted-foreground" : "text-muted-foreground/50"}`}
      />
      {isActive && safeUrl ? (
        <a
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-accent hover:underline"
        >
          Open Editor
        </a>
      ) : (
        <span className="truncate text-muted-foreground">
          {isStarting ? "Editor starting\u2026" : "Editor unavailable"}
        </span>
      )}
      {isActive && password && (
        <button
          onClick={handleCopyPassword}
          className="shrink-0 p-1 transition-colors hover:bg-muted"
          title={copiedPassword ? "Copied!" : "Copy password"}
        >
          {copiedPassword ? (
            <CheckIcon className="h-3.5 w-3.5 text-success" />
          ) : (
            <KeyIcon className="h-3.5 w-3.5 text-secondary-foreground" />
          )}
        </button>
      )}
    </div>
  );
}
