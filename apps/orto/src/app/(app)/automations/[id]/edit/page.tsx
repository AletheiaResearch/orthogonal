"use client";

import { ErrorBanner, SidebarIcon, BackIcon } from "@orthogonal/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, use } from "react";

import {
  AutomationForm,
  type AutomationFormValues,
} from "@/components/automations/automation-form";
import { useSidebarContext } from "@/components/sidebar-layout";
import { useAutomation } from "@/hooks/use-automations";
import { SHORTCUT_LABELS } from "@/lib/keyboard-shortcuts";

export default function EditAutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isOpen, toggle } = useSidebarContext();
  const router = useRouter();
  const { automation, loading } = useAutomation(id);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (values: AutomationFormValues) => {
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/automations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (res.ok) {
        router.push(`/automations/${id}`);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to update automation");
        setSubmitting(false);
      }
    } catch {
      setError("Failed to update automation");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground" />
      </div>
    );
  }

  if (!automation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Automation not found.</p>
        <Link href="/automations">
          <button className="text-sm text-accent hover:underline">Back to Automations</button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {!isOpen && (
        <header className="flex-shrink-0 border-b border-border-muted">
          <div className="flex items-center gap-2 px-4 py-3">
            <button
              onClick={toggle}
              className="p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              title={`Open sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
              aria-label={`Open sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
            >
              <SidebarIcon className="h-4 w-4" />
            </button>
            <Link
              href={`/automations/${id}`}
              className="p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Back to automation"
            >
              <BackIcon className="h-4 w-4" />
            </Link>
          </div>
        </header>
      )}

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-2xl">
          <h1 className="mb-6 text-3xl font-semibold text-foreground">Edit Automation</h1>

          {error && (
            <ErrorBanner className="mb-4" role="alert">
              {error}
            </ErrorBanner>
          )}

          <AutomationForm
            mode="edit"
            initialValues={{
              name: automation.name,
              repoOwner: automation.repoOwner,
              repoName: automation.repoName,
              baseBranch: automation.baseBranch,
              model: automation.model,
              reasoningEffort: automation.reasoningEffort,
              scheduleCron: automation.scheduleCron ?? "0 9 * * *",
              scheduleTz: automation.scheduleTz,
              instructions: automation.instructions,
              triggerType: automation.triggerType,
              eventType: automation.eventType ?? undefined,
              triggerConfig: automation.triggerConfig ?? undefined,
            }}
            onSubmit={handleSubmit}
            submitting={submitting}
          />
        </div>
      </div>
    </div>
  );
}
