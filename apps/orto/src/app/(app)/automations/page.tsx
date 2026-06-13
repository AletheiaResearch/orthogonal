"use client";

import { Button, ErrorBanner, SidebarIcon, PlusIcon } from "@orthogonal/ui";
import Link from "next/link";
import { useState } from "react";

import { AutomationsList } from "@/components/automations/automations-list";
import { useSidebarContext } from "@/components/sidebar-layout";
import { useAutomations } from "@/hooks/use-automations";
import { SHORTCUT_LABELS } from "@/lib/keyboard-shortcuts";

export default function AutomationsPage() {
  const { isOpen, toggle } = useSidebarContext();
  const { automations, loading, mutate } = useAutomations();

  const [actionError, setActionError] = useState<string | null>(null);

  const handleAction = async (id: string, action: "pause" | "resume" | "trigger" | "delete") => {
    setActionError(null);
    const endpoint =
      action === "delete" ? `/api/automations/${id}` : `/api/automations/${id}/${action}`;
    const method = action === "delete" ? "DELETE" : "POST";

    try {
      const res = await fetch(endpoint, { method });
      if (!res.ok) {
        setActionError(`Failed to ${action} automation`);
        return;
      }
      mutate();
    } catch (error) {
      console.error(`Failed to ${action} automation:`, error);
      setActionError(`Failed to ${action} automation`);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {!isOpen && (
        <header className="flex-shrink-0 border-b border-border-muted">
          <div className="px-4 py-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              title={`Open sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
              aria-label={`Open sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
            >
              <SidebarIcon className="h-4 w-4" />
            </Button>
          </div>
        </header>
      )}

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-3xl font-semibold text-foreground">Automations</h1>
            <Link href="/automations/new">
              <Button size="sm">
                <span className="flex items-center gap-1.5">
                  <PlusIcon className="h-4 w-4" />
                  Create Automation
                </span>
              </Button>
            </Link>
          </div>

          {actionError && (
            <ErrorBanner className="mb-4" role="alert">
              {actionError}
            </ErrorBanner>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground" />
            </div>
          ) : (
            <AutomationsList
              automations={automations}
              onPause={(id) => handleAction(id, "pause")}
              onResume={(id) => handleAction(id, "resume")}
              onTrigger={(id) => handleAction(id, "trigger")}
              onDelete={(id) => handleAction(id, "delete")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
