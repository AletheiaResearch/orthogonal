"use client";

import {
  Badge,
  prBadgeVariant,
  ClockIcon,
  SparkleIcon,
  GitPrIcon,
  BranchIcon,
  RepoIcon,
  CopyIcon,
  CheckIcon,
  LinkIcon,
} from "@orthogonal/ui";
import Link from "next/link";
import { useState } from "react";

import { formatModelName, truncateBranch, copyToClipboard } from "@/lib/format";
import { getScmBranchUrl, getScmRepoUrl } from "@/lib/scm";
import { formatSessionCost } from "@/lib/session-cost";
import { formatRelativeTime } from "@/lib/time";
import { getSafeExternalUrl } from "@/lib/urls";
import type { Artifact } from "@/types/session";

interface MetadataSectionProps {
  createdAt: number;
  model?: string;
  reasoningEffort?: string;
  baseBranch: string;
  branchName?: string;
  repoOwner?: string;
  repoName?: string;
  artifacts?: Artifact[];
  parentSessionId?: string | null;
  totalCost?: number;
}

export function MetadataSection({
  createdAt,
  model,
  reasoningEffort,
  baseBranch,
  branchName,
  repoOwner,
  repoName,
  artifacts = [],
  parentSessionId,
  totalCost,
}: MetadataSectionProps) {
  const [copied, setCopied] = useState(false);

  const prArtifact = artifacts.find((a) => a.type === "pr");
  const manualPrArtifact = artifacts.find(
    (a) => a.type === "branch" && (a.metadata?.mode === "manual_pr" || a.metadata?.createPrUrl)
  );
  const prNumber = prArtifact?.metadata?.prNumber;
  const prState = prArtifact?.metadata?.prState;
  const prUrl = getSafeExternalUrl(
    prArtifact?.url || manualPrArtifact?.metadata?.createPrUrl || manualPrArtifact?.url
  );
  const branchUrl =
    branchName && repoOwner && repoName ? getScmBranchUrl(repoOwner, repoName, branchName) : null;

  const handleCopyBranch = async () => {
    if (branchName) {
      const success = await copyToClipboard(branchName);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  return (
    <div className="space-y-3">
      {/* Timestamp */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ClockIcon className="h-4 w-4" />
        <span>{formatRelativeTime(createdAt)}</span>
      </div>

      {/* Parent session */}
      {parentSessionId && (
        <div className="flex items-center gap-2 text-sm">
          <LinkIcon className="h-4 w-4 text-muted-foreground" />
          <Link href={`/session/${parentSessionId}`} className="text-accent hover:underline">
            Parent session
          </Link>
        </div>
      )}

      {/* Model */}
      {model && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <SparkleIcon className="h-4 w-4" />
          <span>
            {formatModelName(model)}
            {reasoningEffort && <span> · {reasoningEffort}</span>}
          </span>
        </div>
      )}

      {typeof totalCost === "number" && totalCost > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Session cost: {formatSessionCost(totalCost)}</span>
        </div>
      )}

      {/* PR Badge */}
      {(prNumber || prUrl) && (
        <div className="flex items-center gap-2 text-sm">
          <RepoIcon className="h-4 w-4 text-muted-foreground" />
          {prUrl ? (
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              {prNumber ? `#${prNumber}` : "Create PR"}
            </a>
          ) : (
            <span className="text-foreground">#{prNumber}</span>
          )}
          {prState && (
            <Badge variant={prBadgeVariant(prState)} className="capitalize">
              {prState}
            </Badge>
          )}
        </div>
      )}

      {/* Base Branch */}
      {baseBranch && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BranchIcon className="h-4 w-4" />
          {repoOwner && repoName ? (
            <a
              href={getScmBranchUrl(repoOwner, repoName, baseBranch)}
              target="_blank"
              rel="noopener noreferrer"
              className="max-w-[180px] truncate text-accent hover:underline"
              title={baseBranch}
            >
              {truncateBranch(baseBranch)}
            </a>
          ) : (
            <span className="max-w-[180px] truncate" title={baseBranch}>
              {truncateBranch(baseBranch)}
            </span>
          )}
        </div>
      )}

      {/* Working Branch */}
      {branchName && (
        <div className="flex items-center gap-2 text-sm">
          <GitPrIcon className="h-4 w-4 text-muted-foreground" />
          {branchUrl ? (
            <a
              href={branchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="max-w-[180px] truncate text-accent hover:underline"
              title={branchName}
            >
              {truncateBranch(branchName)}
            </a>
          ) : (
            <span className="max-w-[180px] truncate text-foreground" title={branchName}>
              {truncateBranch(branchName)}
            </span>
          )}
          <button
            onClick={handleCopyBranch}
            className="p-1 transition-colors hover:bg-muted"
            title={copied ? "Copied!" : "Copy branch name"}
          >
            {copied ? (
              <CheckIcon className="h-3.5 w-3.5 text-success" />
            ) : (
              <CopyIcon className="h-3.5 w-3.5 text-secondary-foreground" />
            )}
          </button>
        </div>
      )}

      {/* Repository tag */}
      {repoOwner && repoName && (
        <div className="flex items-center gap-2 text-sm">
          <RepoIcon className="h-4 w-4 text-muted-foreground" />
          <a
            href={getScmRepoUrl(repoOwner, repoName)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            {repoOwner}/{repoName}
          </a>
        </div>
      )}
    </div>
  );
}
