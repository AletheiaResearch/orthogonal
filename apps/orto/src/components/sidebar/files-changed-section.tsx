"use client";

import { formatFilePath, formatDiffStat } from "@/lib/format";
import type { FileChange } from "@/types/session";

interface FilesChangedSectionProps {
  files: FileChange[];
}

export function FilesChangedSection({ files }: FilesChangedSectionProps) {
  if (files.length === 0) return null;

  return (
    <div className="space-y-2">
      {files.map((file, index) => {
        const { display, full } = formatFilePath(file.filename);
        const { additions, deletions } = formatDiffStat(file.additions, file.deletions);

        return (
          <div
            key={`${file.filename}-${index}`}
            className="flex items-center justify-between gap-2 text-sm"
            title={full}
          >
            <span className="flex-1 truncate text-foreground">{display}</span>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <span className="font-mono text-xs text-success">{additions}</span>
              <span className="font-mono text-xs text-destructive">{deletions}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
