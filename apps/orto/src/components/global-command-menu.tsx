"use client";

import type { Session } from "@open-inspect/shared";
import {
  AppIcon,
  AutomationsIcon,
  BranchIcon,
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  DialogDescription,
  DialogTitle,
  PlusIcon,
  SettingsIcon,
} from "@orthogonal/ui";
import { useMemo } from "react";

import { SHORTCUT_LABELS } from "@/lib/keyboard-shortcuts";
import { APP_ICON_URL, APP_NAME } from "@/lib/site-config";
import { formatRelativeTime } from "@/lib/time";

interface GlobalCommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (href: string) => void;
  onNewSession: () => void;
  sessions: Session[];
}

function buildSessionUrl(session: Session): string {
  const searchParams = new URLSearchParams({
    repoOwner: session.repoOwner,
    repoName: session.repoName,
  });

  if (session.title) {
    searchParams.set("title", session.title);
  }

  return `/session/${session.id}?${searchParams.toString()}`;
}

export function GlobalCommandMenu({
  open,
  onOpenChange,
  onNavigate,
  onNewSession,
  sessions,
}: GlobalCommandMenuProps) {
  const recentSessions = useMemo(
    () => sessions.filter((session) => session.status !== "archived").slice(0, 25),
    [sessions]
  );

  const handleSelect = (callback: () => void) => {
    onOpenChange(false);
    callback();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle className="sr-only">Command menu</DialogTitle>
      <DialogDescription className="sr-only">
        Search and jump to sessions, settings, automations, and other destinations.
      </DialogDescription>
      <Command>
        <CommandInput placeholder="Type a command or search sessions..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Navigation">
            <CommandItem onSelect={() => handleSelect(onNewSession)}>
              <PlusIcon className="h-4 w-4" />
              <span>New session</span>
              <CommandShortcut>{SHORTCUT_LABELS.NEW_SESSION}</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect(() => onNavigate("/"))}>
              <AppIcon iconUrl={APP_ICON_URL} alt={`${APP_NAME} logo`} className="h-4 w-4" />
              <span>Home</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect(() => onNavigate("/settings"))}>
              <SettingsIcon className="h-4 w-4" />
              <span>Settings</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect(() => onNavigate("/automations"))}>
              <AutomationsIcon className="h-4 w-4" />
              <span>Automations</span>
            </CommandItem>
          </CommandGroup>

          {recentSessions.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Sessions">
                {recentSessions.map((session) => {
                  const sessionTitle = session.title || `${session.repoOwner}/${session.repoName}`;
                  const repoLabel = `${session.repoOwner}/${session.repoName}`;
                  const timestamp = session.updatedAt || session.createdAt;

                  return (
                    <CommandItem
                      key={session.id}
                      value={`${session.id} ${sessionTitle} ${repoLabel}`}
                      onSelect={() => handleSelect(() => onNavigate(buildSessionUrl(session)))}
                      className="items-start"
                    >
                      <BranchIcon className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{sessionTitle}</div>
                        <div className="truncate text-xs text-muted-foreground">{repoLabel}</div>
                      </div>
                      <CommandShortcut>{formatRelativeTime(timestamp)}</CommandShortcut>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
