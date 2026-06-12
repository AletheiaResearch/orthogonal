"use client";

import {
  KeyIcon,
  ModelIcon,
  BoxIcon,
  KeyboardIcon,
  DataControlsIcon,
  IntegrationsIcon,
  AppearanceIcon,
  TerminalIcon,
  ChevronRightIcon,
} from "@/components/ui/icons";
import { useIsMobile } from "@/hooks/use-media-query";

const NAV_ITEMS = [
  {
    id: "secrets",
    label: "Secrets",
    icon: KeyIcon,
  },
  {
    id: "models",
    label: "Models",
    icon: ModelIcon,
  },
  {
    id: "images",
    label: "Images",
    icon: BoxIcon,
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: AppearanceIcon,
  },
  {
    id: "keyboard-shortcuts",
    label: "Keyboard",
    icon: KeyboardIcon,
  },
  {
    id: "data-controls",
    label: "Data Controls",
    icon: DataControlsIcon,
  },
  {
    id: "sandbox",
    label: "Sandbox",
    icon: TerminalIcon,
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: IntegrationsIcon,
  },
  {
    id: "mcp-servers",
    label: "MCP Servers",
    icon: TerminalIcon,
  },
] as const;

export type SettingsCategory = (typeof NAV_ITEMS)[number]["id"];

interface SettingsNavProps {
  activeCategory: SettingsCategory;
  onSelect: (category: SettingsCategory) => void;
  onNavigate?: () => void;
}

export function SettingsNav({ activeCategory, onSelect, onNavigate }: SettingsNavProps) {
  const isMobile = useIsMobile();
  const navItems = NAV_ITEMS;

  if (isMobile) {
    return (
      <nav className="p-4">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Settings</h2>
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  onClick={() => {
                    onSelect(item.id);
                    onNavigate?.();
                  }}
                  className="flex w-full items-center gap-2 rounded px-3 py-3 text-sm text-foreground transition hover:bg-muted"
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav className="w-48 flex-shrink-0 border-r border-border-muted p-4">
      <h2 className="mb-4 text-lg font-semibold text-foreground">Settings</h2>
      <ul className="space-y-1">
        {navItems.map((item) => {
          const isActive = activeCategory === item.id;
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <button
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={`flex w-full items-center gap-2 rounded px-3 py-2 text-sm transition ${
                  isActive
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
