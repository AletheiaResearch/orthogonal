"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  AutomationForm,
  type AutomationFormValues,
} from "@/components/automations/automation-form";
import { WebhookConfig } from "@/components/automations/webhook-config";
import { useSidebarContext } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { SidebarIcon, BackIcon } from "@/components/ui/icons";
import { SHORTCUT_LABELS } from "@/lib/keyboard-shortcuts";

export default function NewAutomationPage() {
  const { isOpen, toggle } = useSidebarContext();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [webhookResult, setWebhookResult] = useState<{
    automationId: string;
    webhookApiKey?: string;
    webhookUrl?: string;
    sentryWebhookUrl?: string;
  } | null>(null);

  const handleSubmit = async (values: AutomationFormValues) => {
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (res.ok) {
        const data = await res.json();
        // For webhook/sentry automations, show post-create info before navigating
        if (data.webhookApiKey || data.sentryWebhookUrl) {
          setWebhookResult({
            automationId: data.automation.id,
            webhookApiKey: data.webhookApiKey,
            webhookUrl: data.webhookUrl,
            sentryWebhookUrl: data.sentryWebhookUrl,
          });
          setSubmitting(false);
        } else {
          router.push(`/automations/${data.automation.id}`);
        }
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create automation");
        setSubmitting(false);
      }
    } catch {
      setError("Failed to create automation");
      setSubmitting(false);
    }
  };

  // After webhook creation, show the API key with a continue button
  if (webhookResult) {
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
            </div>
          </header>
        )}

        <div className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-2xl">
            <h1 className="mb-2 text-3xl font-semibold text-foreground">Automation Created</h1>
            {webhookResult.sentryWebhookUrl ? (
              <>
                <p className="mb-6 text-sm text-muted-foreground">
                  Configure the webhook URL below in your Sentry Custom Integration settings.
                </p>
                <WebhookConfig
                  webhookUrl={webhookResult.sentryWebhookUrl}
                  automationId={webhookResult.automationId}
                  variant="sentry"
                />
              </>
            ) : (
              <>
                <p className="mb-6 text-sm text-muted-foreground">
                  Save the webhook URL and API key below. The API key will not be shown again.
                </p>
                <WebhookConfig
                  webhookUrl={webhookResult.webhookUrl}
                  webhookApiKey={webhookResult.webhookApiKey}
                  automationId={webhookResult.automationId}
                />
              </>
            )}

            <div className="mt-6">
              <Link href={`/automations/${webhookResult.automationId}`}>
                <Button size="sm">Go to Automation</Button>
              </Link>
            </div>
          </div>
        </div>
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
              href="/automations"
              className="p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Back to automations"
            >
              <BackIcon className="h-4 w-4" />
            </Link>
          </div>
        </header>
      )}

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-2xl">
          <h1 className="mb-6 text-3xl font-semibold text-foreground">Create Automation</h1>

          {error && (
            <ErrorBanner className="mb-4" role="alert">
              {error}
            </ErrorBanner>
          )}

          <AutomationForm mode="create" onSubmit={handleSubmit} submitting={submitting} />
        </div>
      </div>
    </div>
  );
}
