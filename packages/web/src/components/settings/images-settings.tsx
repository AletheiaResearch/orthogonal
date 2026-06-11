"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";

import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { RefreshIcon } from "@/components/ui/icons";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRepos } from "@/hooks/use-repos";
import { supportsRepoImages } from "@/lib/sandbox-provider";
import { formatRelativeTime } from "@/lib/time";

interface RepoImage {
  repo_owner: string;
  repo_name: string;
  status: "building" | "ready" | "failed";
  base_sha: string;
  build_duration_seconds: number;
  error_message?: string;
  created_at: number;
}

interface ImageRegistryData {
  enabledRepos: string[];
  images: RepoImage[];
}

const REPO_IMAGES_KEY = "/api/repo-images";

export function ImagesSettings() {
  const repoImagesSupported = supportsRepoImages();
  const { repos, loading: reposLoading } = useRepos();
  const { data, isLoading: imagesLoading } = useSWR<ImageRegistryData>(
    repoImagesSupported ? REPO_IMAGES_KEY : null
  );
  const [togglingRepos, setTogglingRepos] = useState<Set<string>>(new Set());
  const [triggeringRepos, setTriggeringRepos] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  if (!repoImagesSupported) {
    return (
      <div>
        <h2 className="mb-1 text-xl font-semibold text-foreground">Pre-Built Images</h2>
        <p className="text-sm text-muted-foreground">
          Pre-built images are only available when <code>SANDBOX_PROVIDER=modal</code> or{" "}
          <code>SANDBOX_PROVIDER=vercel</code>.
        </p>
      </div>
    );
  }

  const loading = reposLoading || imagesLoading;

  const enabledRepos = new Set(data?.enabledRepos ?? []);

  const getLatestImage = (owner: string, name: string): RepoImage | undefined => {
    const key = `${owner}/${name}`.toLowerCase();
    return data?.images.find((img) => `${img.repo_owner}/${img.repo_name}`.toLowerCase() === key);
  };

  const handleToggle = async (owner: string, name: string, enabled: boolean) => {
    const repoKey = `${owner}/${name}`.toLowerCase();
    setTogglingRepos((prev) => new Set(prev).add(repoKey));
    setError("");

    try {
      const res = await fetch(
        `/api/repo-images/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/toggle`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        }
      );

      if (!res.ok) {
        const errBody = await res.json();
        setError(errBody.error || "Failed to toggle image build");
      } else {
        mutate(REPO_IMAGES_KEY);
      }
    } catch {
      setError("Failed to toggle image build");
    } finally {
      setTogglingRepos((prev) => {
        const next = new Set(prev);
        next.delete(repoKey);
        return next;
      });
    }
  };

  const handleTrigger = async (owner: string, name: string) => {
    const repoKey = `${owner}/${name}`.toLowerCase();
    setTriggeringRepos((prev) => new Set(prev).add(repoKey));
    setError("");

    try {
      const res = await fetch(
        `/api/repo-images/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/trigger`,
        { method: "POST" }
      );

      if (!res.ok) {
        const errBody = await res.json();
        setError(errBody.error || "Failed to trigger build");
      } else {
        mutate(REPO_IMAGES_KEY);
      }
    } catch {
      setError("Failed to trigger build");
    } finally {
      setTriggeringRepos((prev) => {
        const next = new Set(prev);
        next.delete(repoKey);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Loading image settings...
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div>
        <h2 className="mb-1 text-xl font-semibold text-foreground">Pre-Built Images</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Enable pre-built images to speed up sandbox creation. Images are rebuilt automatically
          when the default branch changes.
        </p>

        {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}

        <div className="space-y-2">
          {repos.map((repo) => {
            const repoKey = `${repo.owner}/${repo.name}`.toLowerCase();
            const isEnabled = enabledRepos.has(repoKey);
            const isToggling = togglingRepos.has(repoKey);
            const isTriggering = triggeringRepos.has(repoKey);
            const image = getLatestImage(repo.owner, repo.name);

            return (
              <div
                key={repo.id}
                className="hover:bg-muted/50 flex items-center justify-between border border-border px-4 py-3 transition"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(checked) => handleToggle(repo.owner, repo.name, checked)}
                    disabled={isToggling}
                    aria-label={`Toggle pre-built images for ${repo.owner}/${repo.name}`}
                  />
                  <span className="truncate text-sm font-medium text-foreground">
                    {repo.owner}/{repo.name}
                  </span>
                </div>

                <div className="ml-4 flex flex-shrink-0 items-center gap-3">
                  <ImageStatus image={image} isEnabled={isEnabled} />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleTrigger(repo.owner, repo.name)}
                    disabled={!isEnabled || isTriggering || image?.status === "building"}
                    title="Rebuild image"
                  >
                    <RefreshIcon className={`h-4 w-4 ${isTriggering ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {repos.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No repositories found. Install the GitHub App on repositories to get started.
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}

function ImageStatus({ image, isEnabled }: { image: RepoImage | undefined; isEnabled: boolean }) {
  if (!isEnabled) {
    return <span className="text-xs text-muted-foreground">Disabled</span>;
  }

  if (!image) {
    return <span className="text-xs text-muted-foreground">No image</span>;
  }

  if (image.status === "ready") {
    const sha = image.base_sha ? image.base_sha.slice(0, 7) : "";
    const duration = image.build_duration_seconds
      ? `${Math.round(image.build_duration_seconds)}s`
      : "";
    const details = [sha, duration].filter(Boolean).join(" · ");

    return (
      <div className="text-right">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-success" />
          <span className="text-xs text-foreground">
            Ready {formatRelativeTime(image.created_at)}
          </span>
        </div>
        {details && <span className="text-xs text-muted-foreground">{details}</span>}
      </div>
    );
  }

  if (image.status === "building") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-warning" />
        <span className="text-xs text-foreground">
          Building... {formatRelativeTime(image.created_at)}
        </span>
      </div>
    );
  }

  if (image.status === "failed") {
    return (
      <div className="text-right">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-destructive" />
          <span className="text-xs text-foreground">Failed</span>
        </div>
        {image.error_message && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block max-w-[200px] cursor-help truncate text-xs text-muted-foreground">
                {image.error_message}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-md overflow-visible whitespace-pre-wrap break-words">
              {image.error_message}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  return null;
}
