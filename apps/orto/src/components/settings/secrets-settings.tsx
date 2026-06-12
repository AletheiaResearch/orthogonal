"use client";

import { useState } from "react";

import { SecretsEditor } from "@/components/secrets-editor";
import { Combobox } from "@/components/ui/combobox";
import { ChevronDownIcon, CheckIcon } from "@/components/ui/icons";
import { useRepos } from "@/hooks/use-repos";

const GLOBAL_SCOPE = "__global__";

export function SecretsSettings() {
  const { repos, loading: loadingRepos } = useRepos();
  const [selectedRepo, setSelectedRepo] = useState(GLOBAL_SCOPE);

  const selectedRepoObj = repos.find((r) => r.fullName === selectedRepo);
  const isGlobal = selectedRepo === GLOBAL_SCOPE;
  const displayRepoName = isGlobal
    ? "All Repositories (Global)"
    : selectedRepoObj
      ? selectedRepoObj.fullName
      : loadingRepos
        ? "Loading..."
        : "Select a repository";

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-foreground">Secrets</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Manage environment variables that are injected into sandbox sessions.
      </p>

      {/* Repo selector */}
      <div className="mb-6">
        <label className="mb-1.5 block text-sm font-medium text-foreground">Repository</label>
        <Combobox
          value={selectedRepo}
          onChange={setSelectedRepo}
          items={repos.map((repo) => ({
            value: repo.fullName,
            label: repo.name,
            description: `${repo.owner}${repo.private ? " \u2022 private" : ""}`,
          }))}
          searchable
          searchPlaceholder="Search repositories..."
          filterFn={(option, query) =>
            option.label.toLowerCase().includes(query) ||
            (option.description?.toLowerCase().includes(query) ?? false) ||
            String(option.value).toLowerCase().includes(query)
          }
          direction="down"
          dropdownWidth="w-full max-w-sm"
          disabled={loadingRepos}
          triggerClassName="w-full max-w-sm flex items-center justify-between px-3 py-2 text-sm border border-border bg-input text-foreground hover:border-foreground/30 disabled:opacity-50 disabled:cursor-not-allowed transition"
          prependContent={({ select }) => (
            <>
              <button
                type="button"
                onClick={() => select(GLOBAL_SCOPE)}
                className={`flex w-full items-center justify-between px-3 py-2 text-sm transition hover:bg-muted ${
                  isGlobal ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <div className="flex flex-col items-start text-left">
                  <span className="font-medium">All Repositories (Global)</span>
                  <span className="text-xs text-secondary-foreground">
                    Shared across all repositories
                  </span>
                </div>
                {isGlobal && <CheckIcon className="h-4 w-4 text-accent" />}
              </button>
              {repos.length > 0 && <div className="my-1 border-t border-border" />}
            </>
          )}
        >
          <span className="truncate">{displayRepoName}</span>
          <ChevronDownIcon className="h-3 w-3 flex-shrink-0" />
        </Combobox>
      </div>

      {isGlobal ? (
        <SecretsEditor scope="global" disabled={loadingRepos} />
      ) : (
        <SecretsEditor
          scope="repo"
          owner={selectedRepoObj?.owner}
          name={selectedRepoObj?.name}
          disabled={loadingRepos}
        />
      )}
    </div>
  );
}
