"use client";

import { describeCron, GITHUB_WEBHOOK_EVENT_CATALOG } from "@open-inspect/shared";
import type { Automation } from "@open-inspect/shared";
import { Button, FolderIcon, ClockIcon, BoltIcon } from "@orthogonal/ui";
import Link from "next/link";
import { useState } from "react";

import { AutomationStatusBadge } from "@/components/automations/automation-status-badge";
import { formatRelativeTime } from "@/lib/time";

interface AutomationsListProps {
  automations: Automation[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onTrigger: (id: string) => void;
  onDelete: (id: string) => void;
}

const GITHUB_EVENT_LABELS: Record<string, string> = Object.fromEntries(
  GITHUB_WEBHOOK_EVENT_CATALOG.map(({ event, action, shortLabel }) => [
    `${event}.${action}`,
    shortLabel,
  ])
);

function describeTrigger(automation: Automation): string {
  if (automation.triggerType === "schedule" && automation.scheduleCron) {
    return describeCron(automation.scheduleCron, automation.scheduleTz);
  }

  const TRIGGER_LABELS: Record<string, string> = {
    sentry: "Sentry alert",
    webhook: "Inbound webhook",
    github_event: "GitHub event",
    linear_event: "Linear event",
  };

  const label = TRIGGER_LABELS[automation.triggerType] || automation.triggerType;

  if (automation.eventType) {
    const EVENT_LABELS: Record<string, string> = {
      "issue.created": "new error",
      "issue.regression": "error regression",
      "metric_alert.critical": "metric alert",
      "webhook.received": "webhook received",
      ...GITHUB_EVENT_LABELS,
    };
    const eventLabel = EVENT_LABELS[automation.eventType] || automation.eventType;
    return `${label}: ${eventLabel}`;
  }

  return label;
}

export function AutomationsList({
  automations,
  onPause,
  onResume,
  onTrigger,
  onDelete,
}: AutomationsListProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (automations.length === 0) {
    return (
      <div className="rounded-md border border-border-muted bg-card p-8 text-center">
        <p className="text-muted-foreground">No automations yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Create one to run tasks on a schedule or in response to events.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border-muted rounded-md border border-border-muted bg-card">
      {automations.map((automation) => (
        <div key={automation.id} className="px-4 py-4">
          {/* Header: Name + badge | Actions */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <Link
                href={`/automations/${automation.id}`}
                className="truncate font-medium text-foreground transition hover:text-accent"
              >
                {automation.name}
              </Link>
              <AutomationStatusBadge automation={automation} />
            </div>
            <div className="flex flex-shrink-0 items-center gap-1">
              {automation.enabled ? (
                <Button variant="ghost" size="xs" onClick={() => onPause(automation.id)}>
                  Pause
                </Button>
              ) : (
                <Button variant="ghost" size="xs" onClick={() => onResume(automation.id)}>
                  Resume
                </Button>
              )}
              <Button variant="ghost" size="xs" onClick={() => onTrigger(automation.id)}>
                <span className="flex items-center gap-1">
                  <BoltIcon className="h-3 w-3" aria-hidden="true" />
                  Trigger
                </span>
              </Button>
              {confirmDeleteId === automation.id ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="destructive"
                    size="xs"
                    onClick={() => {
                      onDelete(automation.id);
                      setConfirmDeleteId(null);
                    }}
                  >
                    Confirm
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => setConfirmDeleteId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="destructive"
                  size="xs"
                  onClick={() => setConfirmDeleteId(automation.id)}
                >
                  Delete
                </Button>
              )}
            </div>
          </div>

          {/* Metadata: icon-paired items */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <FolderIcon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
              {automation.repoOwner}/{automation.repoName}
            </span>
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
              {describeTrigger(automation)}
            </span>
            {automation.triggerType === "schedule" && automation.nextRunAt && (
              <span className="inline-flex items-center gap-1">
                Next: {formatRelativeTime(automation.nextRunAt)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
