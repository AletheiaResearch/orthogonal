"use client";

import { MODEL_OPTIONS, DEFAULT_ENABLED_MODELS } from "@open-inspect/shared";
import { Button, Switch } from "@orthogonal/ui";
import { useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";

import { MODEL_PREFERENCES_KEY } from "@/hooks/use-enabled-models";

export function ModelsSettings() {
  const { data, isLoading: loading } = useSWR<{ enabledModels: string[] }>(MODEL_PREFERENCES_KEY);
  const [enabledModels, setEnabledModels] = useState<Set<string>>(new Set(DEFAULT_ENABLED_MODELS));
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Sync SWR data into local state once on initial load
  if (data?.enabledModels && !initialized) {
    setEnabledModels(new Set(data.enabledModels));
    setInitialized(true);
  }

  const toggleModel = (modelId: string) => {
    setEnabledModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        if (next.size <= 1) return prev;
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
    setDirty(true);
  };

  const toggleCategory = (category: (typeof MODEL_OPTIONS)[number], enable: boolean) => {
    setEnabledModels((prev) => {
      const next = new Set(prev);
      for (const model of category.models) {
        if (enable) {
          next.add(model.id);
        } else {
          next.delete(model.id);
        }
      }
      if (next.size === 0) return prev;
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      const res = await fetch("/api/model-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledModels: Array.from(enabledModels) }),
      });

      if (res.ok) {
        mutate(MODEL_PREFERENCES_KEY);
        toast.success("Model preferences saved.");
        setDirty(false);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save preferences");
      }
    } catch {
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Loading model preferences...
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-foreground">Enabled Models</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Choose which models appear in the model selector across the web UI and Slack bot.
      </p>

      <div className="space-y-6">
        {MODEL_OPTIONS.map((group) => {
          const allEnabled = group.models.every((m) => enabledModels.has(m.id));

          return (
            <div key={group.category}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium uppercase tracking-wider text-foreground">
                  {group.category}
                </h3>
                <Button
                  type="button"
                  variant="subtle"
                  size="xs"
                  onClick={() => toggleCategory(group, !allEnabled)}
                  className="hover:text-accent/80 text-accent"
                >
                  {allEnabled ? "Disable all" : "Enable all"}
                </Button>
              </div>
              <div className="space-y-2">
                {group.models.map((model) => {
                  const isEnabled = enabledModels.has(model.id);
                  return (
                    <label
                      key={model.id}
                      htmlFor={`model-toggle-${model.id}`}
                      className="hover:bg-muted/50 flex cursor-pointer items-center justify-between border border-border px-4 py-3 transition"
                    >
                      <div>
                        <span className="text-sm font-medium text-foreground">{model.name}</span>
                        <span className="ml-2 text-sm text-muted-foreground">
                          {model.description}
                        </span>
                      </div>
                      <Switch
                        id={`model-toggle-${model.id}`}
                        checked={isEnabled}
                        onCheckedChange={() => toggleModel(model.id)}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
