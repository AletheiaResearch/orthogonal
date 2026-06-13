"use client";

import type { McpServerConfig, McpServerMetadata } from "@open-inspect/shared";
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
  PlusIcon,
  TerminalIcon,
  GlobeIcon,
  ChevronRightIcon,
  Input,
  Label,
  Switch,
} from "@orthogonal/ui";
import { useState, useCallback, type ClipboardEvent } from "react";
import { toast } from "sonner";

import {
  useMcpServers,
  createMcpServer,
  updateMcpServer,
  deleteMcpServer,
} from "@/hooks/use-mcp-servers";
import { useRepos } from "@/hooks/use-repos";
import { parseMaybeEnvContent } from "@/lib/env-paste";

type ScopeMode = "global" | "selected";

type EnvRow = { id: string; key: string; value: string };

function createEnvRow(init?: { key: string; value: string }): EnvRow {
  return { id: crypto.randomUUID(), key: init?.key ?? "", value: init?.value ?? "" };
}

function envRowsToRecord(rows: EnvRow[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of rows) {
    const k = row.key.trim();
    if (k && row.value) result[k] = row.value;
  }
  return result;
}

type FormState = {
  name: string;
  type: "local" | "remote";
  command: string;
  url: string;
  envRows: EnvRow[];
  repoScopes: string[];
  scopeMode: ScopeMode;
  enabled: boolean;
};

const emptyForm: FormState = {
  name: "",
  type: "local",
  command: "",
  url: "",
  envRows: [createEnvRow()],
  repoScopes: [],
  scopeMode: "global",
  enabled: true,
};

/** Render command tokens as a single editable string, quoting and escaping as needed. */
export function formatCommandTokens(tokens: string[]): string {
  return tokens
    .map((t) =>
      /[\s$`#!&|;<>(){}\\"]/.test(t) ? `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : t
    )
    .join(" ");
}

function metadataToForm(metadata: McpServerMetadata): FormState {
  return {
    name: metadata.name,
    type: metadata.type,
    command: metadata.command ? formatCommandTokens(metadata.command) : "",
    url: metadata.url ?? "",
    envRows: [createEnvRow()],
    repoScopes: metadata.repoScopes ?? [],
    scopeMode: metadata.repoScopes?.length ? "selected" : "global",
    enabled: metadata.enabled,
  };
}

/**
 * Minimal shell-quote aware parser: respects "..." and '...' grouping.
 * Inside double quotes, a backslash escapes only `"` and `\` (the characters
 * formatCommandTokens emits); any other backslash stays literal.
 */
export function parseCommand(cmd: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: string | null = null;
  let escaped = false;
  for (const ch of cmd) {
    if (escaped) {
      current += ch === '"' || ch === "\\" ? ch : `\\${ch}`;
      escaped = false;
    } else if (quote === '"' && ch === "\\") {
      escaped = true;
    } else if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (escaped) current += "\\";
  if (current) tokens.push(current);
  return tokens;
}

function EnvRowsEditor({
  form,
  setForm,
  hasExistingCredentials,
}: {
  form: FormState;
  setForm: (form: FormState) => void;
  hasExistingCredentials?: boolean;
}) {
  const isRemote = form.type === "remote";
  const label = isRemote ? "HTTP Headers" : "Environment Variables";
  const keyPlaceholder = isRemote ? "Header-Name" : "KEY_NAME";
  const valuePlaceholder = isRemote ? "value" : "value";

  const updateRow = useCallback(
    (id: string, field: "key" | "value", val: string) => {
      setForm({
        ...form,
        envRows: form.envRows.map((r) => (r.id === id ? { ...r, [field]: val } : r)),
      });
    },
    [form, setForm]
  );

  const removeRow = useCallback(
    (id: string) => {
      const next = form.envRows.filter((r) => r.id !== id);
      setForm({ ...form, envRows: next.length > 0 ? next : [createEnvRow()] });
    },
    [form, setForm]
  );

  const addRow = useCallback(() => {
    setForm({ ...form, envRows: [...form.envRows, createEnvRow()] });
  }, [form, setForm]);

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLInputElement>) => {
      const text = event.clipboardData.getData("text");
      const parsed = parseMaybeEnvContent(text);
      if (parsed.length === 0) return;

      event.preventDefault();

      const next = [...form.envRows];
      const keyToIndex = new Map<string, number>();
      next.forEach((row, i) => {
        if (row.key.trim()) keyToIndex.set(row.key.trim(), i);
      });

      for (const entry of parsed) {
        const existing = keyToIndex.get(entry.key);
        if (existing !== undefined) {
          next[existing] = { ...next[existing], key: entry.key, value: entry.value };
          continue;
        }
        const emptyIdx = next.findIndex(
          (r) => !keyToIndex.has(r.key.trim()) && !r.key.trim() && !r.value.trim()
        );
        if (emptyIdx >= 0) {
          next[emptyIdx] = { ...next[emptyIdx], key: entry.key, value: entry.value };
          keyToIndex.set(entry.key, emptyIdx);
        } else {
          next.push(createEnvRow({ key: entry.key, value: entry.value }));
          keyToIndex.set(entry.key, next.length - 1);
        }
      }

      setForm({ ...form, envRows: next });
      toast.success(
        `Imported ${parsed.length} entr${parsed.length === 1 ? "y" : "ies"} from paste`
      );
    },
    [form, setForm]
  );

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Label>
          {label} <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Button type="button" variant="subtle" size="xs" onClick={addRow}>
          + Add
        </Button>
      </div>
      {hasExistingCredentials && form.envRows.every((r) => !r.value.trim()) && (
        <p className="mb-1 text-xs text-muted-foreground">
          Credentials are configured. Enter new values to replace them, or leave empty to keep
          existing.
        </p>
      )}
      <div className="space-y-1.5">
        {form.envRows.map((row) => (
          <div key={row.id} className="flex gap-1.5">
            <Input
              value={row.key}
              onChange={(e) => updateRow(row.id, "key", e.target.value)}
              onPaste={handlePaste}
              placeholder={keyPlaceholder}
              className="h-8 min-w-[140px] flex-1 font-mono text-xs"
            />
            <Input
              type="password"
              value={row.value}
              onChange={(e) => updateRow(row.id, "value", e.target.value)}
              onPaste={handlePaste}
              placeholder={valuePlaceholder}
              className="h-8 min-w-[180px] flex-1 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => removeRow(row.id)}
              className="px-1.5 text-muted-foreground transition hover:text-destructive"
              aria-label="Remove"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Paste a <code className="text-xs">.env</code> block into any field to import multiple
        entries.
      </p>
    </div>
  );
}

interface McpServerFormProps {
  form: FormState;
  setForm: (form: FormState) => void;
  repos: { fullName: string; private?: boolean }[];
  loadingRepos: boolean;
  radioPrefix: string;
  hasExistingCredentials?: boolean;
}

function McpServerForm({
  form,
  setForm,
  repos,
  loadingRepos,
  radioPrefix,
  hasExistingCredentials,
}: McpServerFormProps) {
  return (
    <>
      <div>
        <Label className="mb-1.5">Name</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. playwright, context7"
        />
      </div>

      <div>
        <Label className="mb-1.5">Type</Label>
        <div className="flex gap-2">
          <button
            onClick={() => setForm({ ...form, type: "local" })}
            className={`flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-sm transition ${
              form.type === "local"
                ? "border-foreground/30 bg-muted text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <TerminalIcon className="h-3.5 w-3.5" />
            Local
          </button>
          <button
            onClick={() => setForm({ ...form, type: "remote" })}
            className={`flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-sm transition ${
              form.type === "remote"
                ? "border-foreground/30 bg-muted text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <GlobeIcon className="h-3.5 w-3.5" />
            Remote
          </button>
        </div>
      </div>

      {form.type === "remote" ? (
        <div>
          <Label className="mb-1.5">URL</Label>
          <Input
            type="url"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://mcp.example.com/sse"
          />
        </div>
      ) : (
        <div>
          <Label className="mb-1.5">Command</Label>
          <Input
            value={form.command}
            onChange={(e) => setForm({ ...form, command: e.target.value })}
            placeholder="npx -y @playwright/mcp"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Space-separated command and arguments. Use quotes for arguments with spaces.
          </p>
        </div>
      )}

      <EnvRowsEditor
        form={form}
        setForm={setForm}
        hasExistingCredentials={hasExistingCredentials}
      />

      <div>
        <Label className="mb-1.5">Availability</Label>
        <div className="mb-2 space-y-2">
          <RadioCard
            name={`scope-mode-${radioPrefix}`}
            checked={form.scopeMode === "global"}
            onChange={() => setForm({ ...form, scopeMode: "global", repoScopes: [] })}
            label="All repositories"
            description="Available in every agent session"
          />
          <RadioCard
            name={`scope-mode-${radioPrefix}`}
            checked={form.scopeMode === "selected"}
            onChange={() => setForm({ ...form, scopeMode: "selected" })}
            label="Selected repositories only"
            description="Only available in sessions for chosen repos"
          />
        </div>

        {form.scopeMode === "selected" && (
          <>
            {loadingRepos ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">Loading repositories...</p>
            ) : repos.length === 0 ? (
              <p className="rounded-sm border border-border px-3 py-2 text-sm text-muted-foreground">
                No repositories available. Connect a GitHub integration first.
              </p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-sm border border-border">
                {repos.map((repo) => {
                  const fullName = repo.fullName.toLowerCase();
                  const isChecked = form.repoScopes.includes(fullName);
                  return (
                    <label
                      key={repo.fullName}
                      className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition"
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => {
                          const next = isChecked
                            ? form.repoScopes.filter((r) => r !== fullName)
                            : [...form.repoScopes, fullName];
                          setForm({ ...form, repoScopes: next });
                        }}
                      />
                      <span className="text-foreground">{repo.fullName}</span>
                      {repo.private && (
                        <span className="text-xs text-muted-foreground">private</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
            {form.repoScopes.length === 0 && repos.length > 0 && (
              <p className="mt-1 text-xs text-warning">
                Select a repository or switch to &quot;All repositories&quot;.
              </p>
            )}
          </>
        )}
      </div>

      <label
        htmlFor={`mcp-enabled-${radioPrefix}`}
        className="flex cursor-pointer items-center justify-between"
      >
        <span className="text-sm text-foreground">Enabled</span>
        <Switch
          id={`mcp-enabled-${radioPrefix}`}
          checked={form.enabled}
          onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}
        />
      </label>
    </>
  );
}

export function McpServersSettings() {
  const { servers, loading, mutate } = useMcpServers();
  const { repos, loading: loadingRepos } = useRepos();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  function startNew() {
    setExpanded(null);
    setForm(emptyForm);
    setEditing("new");
  }

  function startEdit(server: McpServerMetadata) {
    if (expanded === server.id) {
      setExpanded(null);
      setEditing(null);
    } else {
      setForm(metadataToForm(server));
      setEditing(server.id);
      setExpanded(server.id);
    }
  }

  function cancel() {
    setEditing(null);
    setExpanded(null);
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (form.type === "remote" && !form.url.trim()) {
      toast.error("URL is required for remote servers");
      return;
    }
    if (form.type === "local" && !form.command.trim()) {
      toast.error("Command is required for local servers");
      return;
    }
    if (form.scopeMode === "selected" && form.repoScopes.length === 0) {
      toast.error("Select at least one repository or switch to All repositories");
      return;
    }

    setSaving(true);

    try {
      const payload: Partial<McpServerConfig> = {
        name: form.name.trim(),
        type: form.type,
        enabled: form.enabled,
        repoScopes:
          form.scopeMode === "selected" && form.repoScopes.length > 0 ? form.repoScopes : null,
      };

      const envRecord = envRowsToRecord(form.envRows);
      const hasEnvValues = Object.keys(envRecord).length > 0;

      if (form.type === "remote") {
        payload.url = form.url.trim();
        if (hasEnvValues || editing === "new") {
          payload.headers = envRecord;
        }
      } else {
        payload.command = parseCommand(form.command);
        if (hasEnvValues || editing === "new") {
          payload.env = envRecord;
        }
      }

      if (editing === "new") {
        await createMcpServer(payload as Omit<McpServerConfig, "id">);
        toast.success("MCP server created");
      } else if (editing) {
        await updateMcpServer(editing, payload);
        toast.success("MCP server updated");
      }

      setEditing(null);
      setExpanded(null);
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteMcpServer(id);
      mutate();
      if (editing === id) {
        setEditing(null);
        setExpanded(null);
      }
      toast.success("MCP server deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
    setDeleteTarget(null);
  }

  async function handleToggle(server: McpServerMetadata) {
    try {
      await updateMcpServer(server.id, { enabled: !server.enabled });
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle");
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">MCP Servers</h2>
        <Button onClick={startNew} variant="outline" size="sm">
          <span className="inline-flex items-center gap-1">
            <PlusIcon className="h-3.5 w-3.5" />
            Add Server
          </span>
        </Button>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Configure Model Context Protocol servers that are available to agent sessions.
      </p>

      {/* New server form */}
      {editing === "new" && (
        <div className="mb-6 space-y-4 rounded-md border border-border p-4">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">New MCP Server</h3>
            <Button variant="ghost" size="icon" onClick={cancel} aria-label="Close">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
          <McpServerForm
            form={form}
            setForm={setForm}
            repos={repos}
            loadingRepos={loadingRepos}
            radioPrefix="new"
          />
          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={saving} size="sm">
              {saving ? "Saving..." : "Add Server"}
            </Button>
            <Button onClick={cancel} variant="outline" size="sm">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Server list */}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : servers.length === 0 && editing !== "new" ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No MCP servers configured. Add one to extend agent capabilities.
        </div>
      ) : (
        <div className="space-y-2">
          {servers.map((server) => {
            const isExpanded = expanded === server.id;
            return (
              <div
                key={server.id}
                className={`rounded-md border transition ${
                  server.enabled
                    ? "border-border bg-card"
                    : "border-border/50 bg-card/50 opacity-60"
                }`}
              >
                {/* Header row */}
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    type="button"
                    className="flex min-w-0 cursor-pointer items-center gap-3 text-left"
                    onClick={() => startEdit(server)}
                  >
                    <ChevronRightIcon
                      className={`h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform ${
                        isExpanded ? "rotate-90" : ""
                      }`}
                    />
                    {server.type === "remote" ? (
                      <GlobeIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    ) : (
                      <TerminalIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {server.name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {server.type === "remote" ? server.url : server.command?.join(" ")}
                        {server.repoScopes?.length ? (
                          <span className="ml-2 text-accent">
                            •{" "}
                            {server.repoScopes.length === 1
                              ? server.repoScopes[0]
                              : `${server.repoScopes.length} repos`}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60 ml-2">• global</span>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="flex flex-shrink-0 items-center gap-1">
                    <Switch
                      checked={server.enabled}
                      onCheckedChange={() => handleToggle(server)}
                      aria-label={server.enabled ? "Disable" : "Enable"}
                    />
                    <button
                      onClick={() => setDeleteTarget(server.id)}
                      className="hover:text-destructive/80 px-2 py-1 text-xs text-destructive transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Expanded edit form */}
                {isExpanded && editing === server.id && (
                  <div className="space-y-4 border-t border-border-muted px-4 pb-4 pt-3">
                    <McpServerForm
                      form={form}
                      setForm={setForm}
                      repos={repos}
                      loadingRepos={loadingRepos}
                      radioPrefix={server.id}
                      hasExistingCredentials={server.hasEnv || server.hasHeaders}
                    />
                    <div className="flex gap-2 pt-2">
                      <Button onClick={save} disabled={saving} size="sm">
                        {saving ? "Saving..." : "Save Changes"}
                      </Button>
                      <Button onClick={cancel} variant="outline" size="sm">
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete MCP server</AlertDialogTitle>
            <AlertDialogDescription>Are you sure? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              className="hover:bg-destructive/90 bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
