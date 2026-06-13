"use client";

import {
  MODEL_REASONING_CONFIG,
  isValidReasoningEffort,
  type EnrichedRepository,
  type GitHubBotSettings,
  type GitHubGlobalConfig,
  type ValidModel,
} from "@open-inspect/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Checkbox,
  RadioCard,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@orthogonal/ui";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";

import { useEnabledModels } from "@/hooks/use-enabled-models";

import { IntegrationSettingsSkeleton } from "./integration-settings-skeleton";

const GLOBAL_SETTINGS_KEY = "/api/integration-settings/github";
const REPO_SETTINGS_KEY = "/api/integration-settings/github/repos";

interface GlobalResponse {
  settings: GitHubGlobalConfig | null;
}

interface RepoSettingsEntry {
  repo: string;
  settings: GitHubBotSettings;
}

interface RepoListResponse {
  repos: RepoSettingsEntry[];
}

interface ReposResponse {
  repos: EnrichedRepository[];
}

export function GitHubIntegrationSettings() {
  const { data: globalData, isLoading: globalLoading } =
    useSWR<GlobalResponse>(GLOBAL_SETTINGS_KEY);
  const { data: repoSettingsData, isLoading: repoSettingsLoading } =
    useSWR<RepoListResponse>(REPO_SETTINGS_KEY);
  const { data: reposData } = useSWR<ReposResponse>("/api/repos");
  const { enabledModelOptions } = useEnabledModels();

  if (globalLoading || repoSettingsLoading) {
    return <IntegrationSettingsSkeleton />;
  }

  const settings = globalData?.settings;
  const repoOverrides = repoSettingsData?.repos ?? [];
  const availableRepos = reposData?.repos ?? [];
  const defaultAutoReviewOnOpen = settings?.defaults?.autoReviewOnOpen ?? true;

  return (
    <div>
      <h3 className="mb-1 text-lg font-semibold text-foreground">GitHub Bot</h3>
      <p className="mb-6 text-sm text-muted-foreground">
        Configure automated PR reviews and comment-triggered actions.
      </p>

      <Section
        title="Connection"
        description="GitHub App access used for repo discovery and scope."
      >
        {availableRepos.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Repository access is available. You can limit the bot to selected repositories below.
          </p>
        ) : (
          <p className="border-warning/20 rounded-sm border bg-warning-muted px-4 py-3 text-sm text-warning">
            GitHub App is not configured or has no accessible repositories. Repository filtering is
            currently unavailable.
          </p>
        )}
      </Section>

      <GlobalSettingsSection settings={settings} availableRepos={availableRepos} />

      <Section
        title="Repository Overrides"
        description="Set model, reasoning, and custom instruction overrides for specific repositories."
      >
        <RepoOverridesSection
          overrides={repoOverrides}
          availableRepos={availableRepos}
          enabledModelOptions={enabledModelOptions}
          defaultAutoReviewOnOpen={defaultAutoReviewOnOpen}
        />
      </Section>
    </div>
  );
}

function GlobalSettingsSection({
  settings,
  availableRepos,
}: {
  settings: GitHubGlobalConfig | null | undefined;
  availableRepos: EnrichedRepository[];
}) {
  const [autoReviewOnOpen, setAutoReviewOnOpen] = useState(
    settings?.defaults?.autoReviewOnOpen ?? true
  );
  const [enabledRepos, setEnabledRepos] = useState<string[]>(settings?.enabledRepos ?? []);
  const [repoScopeMode, setRepoScopeMode] = useState<"all" | "selected">(
    settings?.enabledRepos === undefined ? "all" : "selected"
  );
  const [allowedTriggerUsers, setAllowedTriggerUsers] = useState<string[]>(
    settings?.defaults?.allowedTriggerUsers ?? []
  );
  const [triggerUserMode, setTriggerUserMode] = useState<"write_access" | "specific">(
    settings?.defaults?.allowedTriggerUsers === undefined ? "write_access" : "specific"
  );
  const [codeReviewInstructions, setCodeReviewInstructions] = useState(
    settings?.defaults?.codeReviewInstructions ?? ""
  );
  const [commentActionInstructions, setCommentActionInstructions] = useState(
    settings?.defaults?.commentActionInstructions ?? ""
  );
  const [newUsername, setNewUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  useEffect(() => {
    if (settings !== undefined && !initialized) {
      if (settings) {
        setAutoReviewOnOpen(settings.defaults?.autoReviewOnOpen ?? true);
        setEnabledRepos(settings.enabledRepos ?? []);
        setRepoScopeMode(settings.enabledRepos === undefined ? "all" : "selected");
        setAllowedTriggerUsers(settings.defaults?.allowedTriggerUsers ?? []);
        setTriggerUserMode(
          settings.defaults?.allowedTriggerUsers === undefined ? "write_access" : "specific"
        );
        setCodeReviewInstructions(settings.defaults?.codeReviewInstructions ?? "");
        setCommentActionInstructions(settings.defaults?.commentActionInstructions ?? "");
      }
      setInitialized(true);
    }
  }, [settings, initialized]);

  const isConfigured = settings !== null && settings !== undefined;

  const handleReset = () => {
    setShowResetDialog(true);
  };

  const handleConfirmReset = async () => {
    setSaving(true);
    setError("");

    try {
      const res = await fetch(GLOBAL_SETTINGS_KEY, { method: "DELETE" });

      if (res.ok) {
        mutate(GLOBAL_SETTINGS_KEY);
        setAutoReviewOnOpen(true);
        setEnabledRepos([]);
        setRepoScopeMode("all");
        setAllowedTriggerUsers([]);
        setTriggerUserMode("write_access");
        setCodeReviewInstructions("");
        setCommentActionInstructions("");
        setNewUsername("");
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
    setError("");

    const body: GitHubGlobalConfig = {
      defaults: {
        autoReviewOnOpen,
        ...(triggerUserMode === "specific" ? { allowedTriggerUsers } : {}),
        ...(codeReviewInstructions ? { codeReviewInstructions } : {}),
        ...(commentActionInstructions ? { commentActionInstructions } : {}),
      },
    };

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

  const addUsername = () => {
    const trimmed = newUsername.trim().toLowerCase();
    if (trimmed && !allowedTriggerUsers.includes(trimmed)) {
      setAllowedTriggerUsers((prev) => [...prev, trimmed]);
      setNewUsername("");
      setDirty(true);
      setError("");
    }
  };

  const toggleRepo = (fullName: string) => {
    const lower = fullName.toLowerCase();
    setEnabledRepos((prev) =>
      prev.includes(lower) ? prev.filter((r) => r !== lower) : [...prev, lower]
    );
    setDirty(true);
    setError("");
  };

  return (
    <Section title="Defaults & Scope" description="Global behavior and repository targeting.">
      {error && <Message tone="error" text={error} />}

      <label
        htmlFor="auto-review-toggle"
        className="hover:bg-muted/50 mb-4 flex cursor-pointer items-center justify-between rounded-sm border border-border px-4 py-3 transition"
      >
        <div>
          <span className="text-sm font-medium text-foreground">Auto-review new PRs</span>
          <span className="ml-2 text-sm text-muted-foreground">
            Automatically review non-draft PRs when opened
          </span>
        </div>
        <Switch
          id="auto-review-toggle"
          checked={autoReviewOnOpen}
          onCheckedChange={(checked) => {
            setAutoReviewOnOpen(checked);
            setDirty(true);
            setError("");
          }}
        />
      </label>

      <div className="mb-4">
        <p className="mb-2 text-sm font-medium text-foreground">Repository Scope</p>
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <RadioCard
            name="repo-scope"
            checked={repoScopeMode === "all"}
            onChange={() => {
              setRepoScopeMode("all");
              setDirty(true);
              setError("");
            }}
            label="All repositories"
            description="Bot responds in every accessible repository."
          />
          <RadioCard
            name="repo-scope"
            checked={repoScopeMode === "selected"}
            onChange={() => {
              setRepoScopeMode("selected");
              setDirty(true);
              setError("");
            }}
            label="Selected repositories"
            description="Bot only responds in the allowlisted repositories."
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
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleRepo(repo.fullName)}
                      />
                      <span className="text-foreground">{repo.fullName}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {enabledRepos.length === 0 && availableRepos.length > 0 && (
              <p className="mt-1 text-xs text-warning">
                No repositories selected. The bot will not respond to webhooks.
              </p>
            )}
          </>
        )}
      </div>

      <div className="mb-4">
        <p className="mb-2 text-sm font-medium text-foreground">Allowed Trigger Users</p>
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <RadioCard
            name="trigger-users"
            checked={triggerUserMode === "write_access"}
            onChange={() => {
              setTriggerUserMode("write_access");
              setDirty(true);
              setError("");
            }}
            label="All users with write access"
            description="Anyone with write permission on the repo can trigger the bot."
          />
          <RadioCard
            name="trigger-users"
            checked={triggerUserMode === "specific"}
            onChange={() => {
              setTriggerUserMode("specific");
              setDirty(true);
              setError("");
            }}
            label="Only specific users"
            description="Only listed GitHub usernames can trigger the bot."
          />
        </div>

        {triggerUserMode === "specific" && (
          <>
            <div className="mb-2 flex items-center gap-2">
              <Input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addUsername();
                  }
                }}
                placeholder="GitHub username"
                className="h-8 flex-1"
              />
              <Button size="sm" onClick={addUsername} disabled={!newUsername.trim()}>
                Add
              </Button>
            </div>

            {allowedTriggerUsers.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {allowedTriggerUsers.map((user) => (
                  <span
                    key={user}
                    className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted px-2 py-0.5 text-sm text-foreground"
                  >
                    {user}
                    <button
                      type="button"
                      onClick={() => {
                        setAllowedTriggerUsers((prev) => prev.filter((u) => u !== user));
                        setDirty(true);
                        setError("");
                      }}
                      className="ml-0.5 text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${user}`}
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}

            {allowedTriggerUsers.length === 0 && (
              <p className="mt-1 text-xs text-warning">
                No users configured. The bot will not respond to any manual triggers (such as
                @mentions or review requests).
              </p>
            )}
          </>
        )}
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-foreground">
          Code Review Instructions
        </label>
        <p className="mb-2 text-xs text-muted-foreground">
          Custom instructions appended to code review prompts. Use this to focus reviews on specific
          areas or coding standards.
        </p>
        <Textarea
          value={codeReviewInstructions}
          onChange={(e) => {
            setCodeReviewInstructions(e.target.value);
            setDirty(true);
            setError("");
          }}
          rows={3}
          placeholder="e.g., Focus on security best practices and ensure all API endpoints validate input."
          className="resize-y"
        />
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-foreground">
          Comment Action Instructions
        </label>
        <p className="mb-2 text-xs text-muted-foreground">
          Custom instructions appended to comment action prompts (@mention responses). Use this to
          guide how the bot responds to comments.
        </p>
        <Textarea
          value={commentActionInstructions}
          onChange={(e) => {
            setCommentActionInstructions(e.target.value);
            setDirty(true);
            setError("");
          }}
          rows={3}
          placeholder="e.g., Always run tests before pushing changes. Prefer minimal diffs."
          className="resize-y"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "Saving..." : "Save"}
        </Button>

        {isConfigured && (
          <Button variant="destructive" onClick={handleReset} disabled={saving}>
            Reset to defaults
          </Button>
        )}
      </div>

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to defaults</AlertDialogTitle>
            <AlertDialogDescription>
              Reset all GitHub bot settings to defaults? The bot will respond to all repos with
              auto-review enabled.
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
  enabledModelOptions,
  defaultAutoReviewOnOpen,
}: {
  overrides: RepoSettingsEntry[];
  availableRepos: EnrichedRepository[];
  enabledModelOptions: { category: string; models: { id: string; name: string }[] }[];
  defaultAutoReviewOnOpen: boolean;
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
      const res = await fetch(`/api/integration-settings/github/repos/${owner}/${name}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: {} }),
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
            <RepoOverrideRow
              key={entry.repo}
              entry={entry}
              enabledModelOptions={enabledModelOptions}
              defaultAutoReviewOnOpen={defaultAutoReviewOnOpen}
            />
          ))}
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">
          No repository overrides yet. Add one to customize model behavior per repo.
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

function RepoOverrideRow({
  entry,
  enabledModelOptions,
  defaultAutoReviewOnOpen,
}: {
  entry: RepoSettingsEntry;
  enabledModelOptions: { category: string; models: { id: string; name: string }[] }[];
  defaultAutoReviewOnOpen: boolean;
}) {
  const [model, setModel] = useState(entry.settings.model ?? "");
  const [effort, setEffort] = useState(entry.settings.reasoningEffort ?? "");
  const [triggerUserMode, setTriggerUserMode] = useState<"global" | "override">(
    entry.settings.allowedTriggerUsers !== undefined ? "override" : "global"
  );
  const [allowedTriggerUsers, setAllowedTriggerUsers] = useState<string[]>(
    entry.settings.allowedTriggerUsers ?? []
  );
  const [codeReviewMode, setCodeReviewMode] = useState<"global" | "override">(
    entry.settings.codeReviewInstructions !== undefined ? "override" : "global"
  );
  const [codeReviewInstructions, setCodeReviewInstructions] = useState(
    entry.settings.codeReviewInstructions ?? ""
  );
  const [commentActionMode, setCommentActionMode] = useState<"global" | "override">(
    entry.settings.commentActionInstructions !== undefined ? "override" : "global"
  );
  const [commentActionInstructions, setCommentActionInstructions] = useState(
    entry.settings.commentActionInstructions ?? ""
  );
  const [autoReviewMode, setAutoReviewMode] = useState<"global" | "override">(
    entry.settings.autoReviewOnOpen !== undefined ? "override" : "global"
  );
  const [autoReviewOnOpen, setAutoReviewOnOpen] = useState(
    entry.settings.autoReviewOnOpen ?? defaultAutoReviewOnOpen
  );
  const [newUsername, setNewUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const reasoningConfig = model ? MODEL_REASONING_CONFIG[model as ValidModel] : undefined;

  const handleModelChange = (newModel: string) => {
    setModel(newModel);
    setDirty(true);

    if (effort && newModel && !isValidReasoningEffort(newModel, effort)) {
      setEffort("");
    }
  };

  const handleAutoReviewModeChange = (newMode: "global" | "override") => {
    setAutoReviewMode(newMode);
    if (newMode === "override" && entry.settings.autoReviewOnOpen === undefined) {
      setAutoReviewOnOpen(defaultAutoReviewOnOpen);
    }
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);

    const [owner, name] = entry.repo.split("/");
    const settings: GitHubBotSettings = {};
    if (model) settings.model = model;
    if (effort) settings.reasoningEffort = effort;
    if (triggerUserMode === "override") settings.allowedTriggerUsers = allowedTriggerUsers;
    if (codeReviewMode === "override") settings.codeReviewInstructions = codeReviewInstructions;
    if (commentActionMode === "override")
      settings.commentActionInstructions = commentActionInstructions;
    if (autoReviewMode === "override") settings.autoReviewOnOpen = autoReviewOnOpen;

    try {
      const res = await fetch(`/api/integration-settings/github/repos/${owner}/${name}`, {
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
      const res = await fetch(`/api/integration-settings/github/repos/${owner}/${name}`, {
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

  const addRepoUsername = () => {
    const trimmed = newUsername.trim().toLowerCase();
    if (trimmed && !allowedTriggerUsers.includes(trimmed)) {
      setAllowedTriggerUsers((prev) => [...prev, trimmed]);
      setNewUsername("");
      setDirty(true);
    }
  };

  return (
    <div className="space-y-2 rounded-sm border border-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-[180px] truncate text-sm font-medium text-foreground">
          {entry.repo}
        </span>

        <Select value={model} onValueChange={handleModelChange}>
          <SelectTrigger density="compact" className="min-w-[180px] flex-1">
            <SelectValue placeholder="Default model" />
          </SelectTrigger>
          <SelectContent>
            {enabledModelOptions.map((group) => (
              <SelectGroup key={group.category}>
                <SelectLabel>{group.category}</SelectLabel>
                {group.models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>

        {reasoningConfig && (
          <Select
            value={effort}
            onValueChange={(v) => {
              setEffort(v);
              setDirty(true);
            }}
          >
            <SelectTrigger density="compact" className="w-36">
              <SelectValue placeholder="Default effort" />
            </SelectTrigger>
            <SelectContent>
              {reasoningConfig.efforts.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "..." : "Save"}
        </Button>

        <Button variant="destructive" size="sm" onClick={handleDelete}>
          Remove
        </Button>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Auto-review new PRs</p>
        <div className="mb-1 flex items-center gap-2">
          <Select value={autoReviewMode} onValueChange={handleAutoReviewModeChange}>
            <SelectTrigger density="compact" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Use global default</SelectItem>
              <SelectItem value="override">Override for this repo</SelectItem>
            </SelectContent>
          </Select>
          {autoReviewMode === "override" && (
            <label className="flex items-center gap-2 text-xs text-foreground">
              <Switch
                checked={autoReviewOnOpen}
                onCheckedChange={(checked) => {
                  setAutoReviewOnOpen(checked);
                  setDirty(true);
                }}
              />
              <span>{autoReviewOnOpen ? "Enabled" : "Disabled"}</span>
            </label>
          )}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Allowed Trigger Users</p>
        <div className="mb-1 flex items-center gap-2">
          <Select
            value={triggerUserMode}
            onValueChange={(v: "global" | "override") => {
              setTriggerUserMode(v);
              setDirty(true);
            }}
          >
            <SelectTrigger density="compact" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Use global default</SelectItem>
              <SelectItem value="override">Override for this repo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {triggerUserMode === "override" && (
          <>
            <div className="mb-1 flex items-center gap-2">
              <Input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRepoUsername();
                  }
                }}
                placeholder="GitHub username"
                className="h-auto flex-1 px-2 py-1 text-xs"
              />
              <Button size="sm" onClick={addRepoUsername} disabled={!newUsername.trim()}>
                Add
              </Button>
            </div>

            {allowedTriggerUsers.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {allowedTriggerUsers.map((user) => (
                  <span
                    key={user}
                    className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted px-1.5 py-0.5 text-xs text-foreground"
                  >
                    {user}
                    <button
                      type="button"
                      onClick={() => {
                        setAllowedTriggerUsers((prev) => prev.filter((u) => u !== user));
                        setDirty(true);
                      }}
                      className="ml-0.5 text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${user}`}
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}

            {allowedTriggerUsers.length === 0 && (
              <p className="text-xs text-warning">
                No users configured. The bot will not respond to any manual triggers for this repo.
              </p>
            )}
          </>
        )}
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Code Review Instructions</p>
        <div className="mb-1 flex items-center gap-2">
          <Select
            value={codeReviewMode}
            onValueChange={(v: "global" | "override") => {
              setCodeReviewMode(v);
              setDirty(true);
            }}
          >
            <SelectTrigger density="compact" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Use global default</SelectItem>
              <SelectItem value="override">Override for this repo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {codeReviewMode === "override" && (
          <Textarea
            value={codeReviewInstructions}
            onChange={(e) => {
              setCodeReviewInstructions(e.target.value);
              setDirty(true);
            }}
            rows={2}
            placeholder="Custom review instructions for this repo..."
            className="resize-y px-2 py-1 text-xs"
          />
        )}
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Comment Action Instructions
        </p>
        <div className="mb-1 flex items-center gap-2">
          <Select
            value={commentActionMode}
            onValueChange={(v: "global" | "override") => {
              setCommentActionMode(v);
              setDirty(true);
            }}
          >
            <SelectTrigger density="compact" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Use global default</SelectItem>
              <SelectItem value="override">Override for this repo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {commentActionMode === "override" && (
          <Textarea
            value={commentActionInstructions}
            onChange={(e) => {
              setCommentActionInstructions(e.target.value);
              setDirty(true);
            }}
            rows={2}
            placeholder="Custom comment action instructions for this repo..."
            className="resize-y px-2 py-1 text-xs"
          />
        )}
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

function Message({ tone, text }: { tone: "error" | "success"; text: string }) {
  const classes =
    tone === "error"
      ? "mb-4 bg-destructive-muted text-destructive px-4 py-3 border border-destructive-border text-sm rounded-sm"
      : "mb-4 bg-success-muted text-success px-4 py-3 border border-success/20 text-sm rounded-sm";

  return (
    <div className={classes} aria-live="polite">
      {text}
    </div>
  );
}
