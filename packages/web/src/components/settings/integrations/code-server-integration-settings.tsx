"use client";

import {
  type EnrichedRepository,
  type CodeServerSettings,
  type CodeServerGlobalConfig,
} from "@open-inspect/shared";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { RadioCard } from "@/components/ui/form-controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { IntegrationSettingsSkeleton } from "./integration-settings-skeleton";

const GLOBAL_SETTINGS_KEY = "/api/integration-settings/code-server";
const REPO_SETTINGS_KEY = "/api/integration-settings/code-server/repos";

interface GlobalResponse {
  settings: CodeServerGlobalConfig | null;
}

interface RepoSettingsEntry {
  repo: string;
  settings: CodeServerSettings;
}

interface RepoListResponse {
  repos: RepoSettingsEntry[];
}

interface ReposResponse {
  repos: EnrichedRepository[];
}

export function CodeServerIntegrationSettings() {
  const { data: globalData, isLoading: globalLoading } =
    useSWR<GlobalResponse>(GLOBAL_SETTINGS_KEY);
  const { data: repoSettingsData, isLoading: repoSettingsLoading } =
    useSWR<RepoListResponse>(REPO_SETTINGS_KEY);
  const { data: reposData } = useSWR<ReposResponse>("/api/repos");

  if (globalLoading || repoSettingsLoading) {
    return <IntegrationSettingsSkeleton />;
  }

  const settings = globalData?.settings;
  const repoOverrides = repoSettingsData?.repos ?? [];
  const availableRepos = reposData?.repos ?? [];

  return (
    <div>
      <h3 className="mb-1 text-lg font-semibold text-foreground">Code Server</h3>
      <p className="mb-6 text-sm text-muted-foreground">
        Attach a browser-based VS Code editor to sandbox sessions. When enabled, each new session
        gets a code-server instance accessible via a tunnel URL.
      </p>

      <GlobalSettingsSection settings={settings} availableRepos={availableRepos} />

      <Section
        title="Repository Overrides"
        description="Override code-server settings for specific repositories."
      >
        <RepoOverridesSection overrides={repoOverrides} availableRepos={availableRepos} />
      </Section>
    </div>
  );
}

function GlobalSettingsSection({
  settings,
  availableRepos,
}: {
  settings: CodeServerGlobalConfig | null | undefined;
  availableRepos: EnrichedRepository[];
}) {
  const [enabled, setEnabled] = useState(settings?.defaults?.enabled ?? false);
  const [enabledRepos, setEnabledRepos] = useState<string[]>(settings?.enabledRepos ?? []);
  const [repoScopeMode, setRepoScopeMode] = useState<"all" | "selected">(
    settings?.enabledRepos == null ? "all" : "selected"
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  useEffect(() => {
    if (settings !== undefined && !initialized) {
      if (settings) {
        setEnabled(settings.defaults?.enabled ?? false);
        setEnabledRepos(settings.enabledRepos ?? []);
        setRepoScopeMode(settings.enabledRepos === undefined ? "all" : "selected");
      }
      setInitialized(true);
    }
  }, [settings, initialized]);

  const isConfigured = settings !== null && settings !== undefined;

  const handleConfirmReset = async () => {
    setSaving(true);

    try {
      const res = await fetch(GLOBAL_SETTINGS_KEY, { method: "DELETE" });

      if (res.ok) {
        mutate(GLOBAL_SETTINGS_KEY);
        setEnabled(false);
        setEnabledRepos([]);
        setRepoScopeMode("all");
        setDirty(false);
        toast.success("Settings reset to defaults.");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to reset settings");
      }
    } catch {
      toast.error("Failed to reset settings");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);

    const defaults: CodeServerSettings = { enabled };
    const body: CodeServerGlobalConfig = { defaults };
    if (repoScopeMode === "selected") {
      body.enabledRepos = enabledRepos;
    }

    try {
      const res = await fetch(GLOBAL_SETTINGS_KEY, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: body }),
      });

      if (res.ok) {
        mutate(GLOBAL_SETTINGS_KEY);
        toast.success("Settings saved.");
        setDirty(false);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save settings");
      }
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const toggleRepo = (fullName: string) => {
    const lower = fullName.toLowerCase();
    setEnabledRepos((prev) =>
      prev.includes(lower) ? prev.filter((r) => r !== lower) : [...prev, lower]
    );
    setDirty(true);
  };

  return (
    <Section
      title="Defaults & Scope"
      description="Enable code-server globally or for specific repositories."
    >
      <div className="mb-4">
        <label className="hover:bg-muted/50 flex cursor-pointer items-center justify-between rounded-sm border border-border px-3 py-2 text-sm transition">
          <div>
            <span className="font-medium text-foreground">Enable code-server</span>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Attach a VS Code editor to new sandbox sessions
            </p>
          </div>
          <input
            type="checkbox"
            checked={enabled}
            onChange={() => {
              setEnabled(!enabled);
              setDirty(true);
            }}
            className="rounded border-border"
          />
        </label>
      </div>

      <div className="mb-4">
        <p className="mb-2 text-sm font-medium text-foreground">Repository Scope</p>
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <RadioCard
            name="cs-repo-scope"
            checked={repoScopeMode === "all"}
            onChange={() => {
              setRepoScopeMode("all");
              setDirty(true);
            }}
            label="All repositories"
            description="Code-server is available for sessions on every accessible repository."
          />
          <RadioCard
            name="cs-repo-scope"
            checked={repoScopeMode === "selected"}
            onChange={() => {
              setRepoScopeMode("selected");
              setDirty(true);
            }}
            label="Selected repositories"
            description="Code-server is only available for repositories in the allowlist."
          />
        </div>

        {repoScopeMode === "selected" && (
          <>
            {availableRepos.length === 0 ? (
              <p className="rounded-sm border border-border px-4 py-3 text-sm text-muted-foreground">
                Repository filtering is unavailable because no repositories are accessible.
              </p>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded-sm border border-border">
                {availableRepos.map((repo) => {
                  const fullName = repo.fullName.toLowerCase();
                  const isChecked = enabledRepos.includes(fullName);

                  return (
                    <label
                      key={repo.fullName}
                      className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 px-4 py-2 text-sm transition"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRepo(repo.fullName)}
                        className="rounded border-border"
                      />
                      <span className="text-foreground">{repo.fullName}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {enabledRepos.length === 0 && availableRepos.length > 0 && (
              <p className="mt-1 text-xs text-warning">
                No repositories selected. Code-server will not be enabled for any sessions.
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "Saving..." : "Save"}
        </Button>

        {isConfigured && (
          <Button variant="destructive" onClick={() => setShowResetDialog(true)} disabled={saving}>
            Reset to defaults
          </Button>
        )}
      </div>

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to defaults</AlertDialogTitle>
            <AlertDialogDescription>
              Reset global code-server defaults and repository scope? Per-repository overrides will
              not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReset}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}

function RepoOverridesSection({
  overrides,
  availableRepos,
}: {
  overrides: RepoSettingsEntry[];
  availableRepos: EnrichedRepository[];
}) {
  const [addingRepo, setAddingRepo] = useState("");

  const overriddenRepos = new Set(overrides.map((o) => o.repo));
  const availableForOverride = availableRepos.filter(
    (r) => !overriddenRepos.has(r.fullName.toLowerCase())
  );

  const handleAdd = async () => {
    if (!addingRepo) return;
    const [owner, name] = addingRepo.split("/");

    try {
      const res = await fetch(`/api/integration-settings/code-server/repos/${owner}/${name}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { enabled: true } }),
      });

      if (res.ok) {
        mutate(REPO_SETTINGS_KEY);
        setAddingRepo("");
        toast.success("Override added.");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to add override");
      }
    } catch {
      toast.error("Failed to add override");
    }
  };

  return (
    <div>
      {overrides.length > 0 ? (
        <div className="mb-4 space-y-2">
          {overrides.map((entry) => (
            <RepoOverrideRow key={entry.repo} entry={entry} />
          ))}
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">
          No repository overrides yet. Add one to enable or disable code-server per repo.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Select value={addingRepo} onValueChange={setAddingRepo}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select a repository..." />
          </SelectTrigger>
          <SelectContent>
            {availableForOverride.map((repo) => (
              <SelectItem key={repo.fullName} value={repo.fullName.toLowerCase()}>
                {repo.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleAdd} disabled={!addingRepo}>
          Add Override
        </Button>
      </div>
    </div>
  );
}

function RepoOverrideRow({ entry }: { entry: RepoSettingsEntry }) {
  const [enabled, setEnabled] = useState(entry.settings.enabled ?? false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleSave = async () => {
    setSaving(true);

    const [owner, name] = entry.repo.split("/");
    const settings: CodeServerSettings = { enabled };

    try {
      const res = await fetch(`/api/integration-settings/code-server/repos/${owner}/${name}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });

      if (res.ok) {
        mutate(REPO_SETTINGS_KEY);
        setDirty(false);
        toast.success(`Override for ${entry.repo} saved.`);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save override");
      }
    } catch {
      toast.error("Failed to save override");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const [owner, name] = entry.repo.split("/");

    try {
      const res = await fetch(`/api/integration-settings/code-server/repos/${owner}/${name}`, {
        method: "DELETE",
      });

      if (res.ok) {
        mutate(REPO_SETTINGS_KEY);
        toast.success(`Override for ${entry.repo} removed.`);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete override");
      }
    } catch {
      toast.error("Failed to delete override");
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded-sm border border-border px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="truncate text-sm font-medium text-foreground">{entry.repo}</span>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={() => {
              setEnabled(!enabled);
              setDirty(true);
            }}
            className="rounded border-border"
          />
          <span className="text-muted-foreground">Enabled</span>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "..." : "Save"}
        </Button>
        <Button variant="destructive" size="sm" onClick={handleDelete}>
          Remove
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-5 rounded-md border border-border-muted p-5">
      <h4 className="mb-1 text-sm font-semibold uppercase tracking-wider text-foreground">
        {title}
      </h4>
      <p className="mb-4 text-sm text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}
