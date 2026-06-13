"use client";

import type { SandboxStatus } from "@open-inspect/shared";
import { GlobeIcon } from "@orthogonal/ui";

import { getSafeExternalUrl } from "@/lib/urls";

import { ACTIVE_SANDBOX_STATUSES } from "./sandbox-statuses";

interface TunnelUrlsSectionProps {
  urls: Record<string, string>;
  sandboxStatus: SandboxStatus;
}

export function TunnelUrlsSection({ urls, sandboxStatus }: TunnelUrlsSectionProps) {
  const isActive = ACTIVE_SANDBOX_STATUSES.has(sandboxStatus);
  const entries = Object.entries(urls);

  return (
    <div className="space-y-1.5">
      {entries.map(([port, url]) => {
        const safeUrl = getSafeExternalUrl(url);
        return (
          <div key={port} className="flex items-center gap-2 text-sm">
            <GlobeIcon
              className={`h-4 w-4 shrink-0 ${isActive && safeUrl ? "text-muted-foreground" : "text-muted-foreground/50"}`}
            />
            {isActive && safeUrl ? (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-accent hover:underline"
              >
                Port {port}
              </a>
            ) : (
              <span className="truncate text-muted-foreground">Port {port}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
