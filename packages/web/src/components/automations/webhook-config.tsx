"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface WebhookConfigProps {
  webhookUrl?: string;
  webhookApiKey?: string;
  automationId?: string;
  variant?: "webhook" | "sentry";
  onRegenerate?: () => Promise<{ webhookApiKey?: string; webhookUrl?: string }>;
}

export function WebhookConfig({
  webhookUrl,
  webhookApiKey,
  automationId: _automationId,
  variant = "webhook",
  onRegenerate,
}: WebhookConfigProps) {
  const [currentKey, setCurrentKey] = useState(webhookApiKey);
  const [currentUrl, setCurrentUrl] = useState(webhookUrl);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState<"url" | "key" | "curl" | null>(null);

  const isSentry = variant === "sentry";
  const urlLabel = isSentry ? "Sentry Webhook URL" : "Webhook URL";
  const keyLabel = isSentry ? "Sentry Client Secret" : "API Key";

  const handleCopy = async (text: string, type: "url" | "key" | "curl") => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleRegenerate = async () => {
    if (!onRegenerate) return;
    setRegenerating(true);
    try {
      const result = await onRegenerate();
      if (result.webhookApiKey) setCurrentKey(result.webhookApiKey);
      if (result.webhookUrl) setCurrentUrl(result.webhookUrl);
    } finally {
      setRegenerating(false);
    }
  };

  const curlCommand =
    !isSentry && currentUrl && currentKey
      ? `curl -X POST "${currentUrl}" \\\n  -H "Authorization: Bearer ${currentKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"test": true}'`
      : "";

  if (!currentUrl && !currentKey) {
    return (
      <div className="rounded-md border border-border-muted p-4 text-sm text-muted-foreground">
        {isSentry
          ? "Sentry webhook URL will be shown after the automation is created."
          : "Webhook URL and API key will be shown after the automation is created."}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-md border border-border-muted bg-background p-4">
      {/* URL */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{urlLabel}</label>
        <div className="flex gap-2">
          <Input type="text" value={currentUrl || ""} readOnly className="font-mono text-xs" />
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => handleCopy(currentUrl || "", "url")}
          >
            {copied === "url" ? "Copied" : "Copy"}
          </Button>
        </div>
        {isSentry && (
          <p className="mt-1 text-xs text-muted-foreground">
            Paste this URL into your Sentry Custom Integration webhook settings.
          </p>
        )}
      </div>

      {/* API Key (webhook variant only) */}
      {currentKey && (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{keyLabel}</label>
          <div className="flex gap-2">
            <Input type="text" value={currentKey} readOnly className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => handleCopy(currentKey, "key")}
            >
              {copied === "key" ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Save this key — it won&apos;t be shown again after you leave this page.
          </p>
        </div>
      )}

      {/* Regenerate + curl */}
      <div className="flex items-center gap-2">
        {onRegenerate && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={handleRegenerate}
            disabled={regenerating}
          >
            {regenerating
              ? isSentry
                ? "Updating..."
                : "Regenerating..."
              : isSentry
                ? "Update Secret"
                : "Regenerate Key"}
          </Button>
        )}
        {curlCommand && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => handleCopy(curlCommand, "curl")}
          >
            {copied === "curl" ? "Copied" : "Copy curl"}
          </Button>
        )}
      </div>
    </div>
  );
}
