"use client";

import { SidebarIcon, BackIcon } from "@orthogonal/ui";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { DataControlsSettings } from "@/components/settings/data-controls-settings";
import { ImagesSettings } from "@/components/settings/images-settings";
import { IntegrationsSettings } from "@/components/settings/integrations-settings";
import { KeyboardShortcutsSettings } from "@/components/settings/keyboard-shortcuts-settings";
import { McpServersSettings } from "@/components/settings/mcp-servers-settings";
import { ModelsSettings } from "@/components/settings/models-settings";
import { SandboxSettingsPage } from "@/components/settings/sandbox-settings";
import { SecretsSettings } from "@/components/settings/secrets-settings";
import { SettingsNav, type SettingsCategory } from "@/components/settings/settings-nav";
import { useSidebarContext } from "@/components/sidebar-layout";
import { useIsMobile } from "@/hooks/use-media-query";
import { SHORTCUT_LABELS } from "@/lib/keyboard-shortcuts";

const CATEGORY_LABELS: Record<SettingsCategory, string> = {
  secrets: "Secrets",
  models: "Models",
  images: "Images",
  appearance: "Appearance",
  "keyboard-shortcuts": "Keyboard",
  "data-controls": "Data Controls",
  sandbox: "Sandbox",
  integrations: "Integrations",
  "mcp-servers": "MCP Servers",
};

const VALID_CATEGORIES = new Set<string>([
  "secrets",
  "models",
  "images",
  "appearance",
  "keyboard-shortcuts",
  "data-controls",
  "sandbox",
  "integrations",
  "mcp-servers",
]);

function isValidCategory(tab: string | null): tab is SettingsCategory {
  return tab !== null && VALID_CATEGORIES.has(tab);
}

export default function SettingsPage() {
  const { isOpen, toggle } = useSidebarContext();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialCategory = isValidCategory(tabParam) ? tabParam : "secrets";
  const [activeCategory, setActiveCategoryRaw] = useState<SettingsCategory>(initialCategory);

  function setActiveCategory(category: SettingsCategory) {
    setActiveCategoryRaw(category);
    window.history.replaceState(null, "", `/settings?tab=${category}`);
  }
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState<"list" | "detail">(
    isValidCategory(tabParam) ? "detail" : "list"
  );

  // Sync state when searchParams change via client-side navigation
  useEffect(() => {
    if (isValidCategory(tabParam)) {
      setActiveCategoryRaw(tabParam);
      setMobileView("detail");
      return;
    }

    setActiveCategoryRaw("secrets");
    setMobileView("list");
  }, [tabParam]);

  const content = (
    <>
      {activeCategory === "secrets" && <SecretsSettings />}
      {activeCategory === "models" && <ModelsSettings />}
      {activeCategory === "images" && <ImagesSettings />}
      {activeCategory === "appearance" && <AppearanceSettings />}
      {activeCategory === "keyboard-shortcuts" && <KeyboardShortcutsSettings />}
      {activeCategory === "data-controls" && <DataControlsSettings />}
      {activeCategory === "sandbox" && <SandboxSettingsPage />}
      {activeCategory === "integrations" && <IntegrationsSettings />}
      {activeCategory === "mcp-servers" && <McpServersSettings />}
    </>
  );

  if (isMobile) {
    return (
      <div className="flex h-full flex-col">
        {mobileView === "list" ? (
          <>
            <header className="flex-shrink-0 border-b border-border-muted">
              <div className="px-4 py-3">
                <button
                  onClick={toggle}
                  className="p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  title={`Open sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
                  aria-label={`Open sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
                >
                  <SidebarIcon className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto">
              <SettingsNav
                activeCategory={activeCategory}
                onSelect={setActiveCategory}
                onNavigate={() => setMobileView("detail")}
              />
            </div>
          </>
        ) : (
          <>
            <header className="flex-shrink-0 border-b border-border-muted">
              <div className="flex items-center gap-2 px-4 py-3">
                <button
                  onClick={toggle}
                  className="p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  title={`Open sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
                  aria-label={`Open sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
                >
                  <SidebarIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setMobileView("list")}
                  className="p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Back to settings"
                >
                  <BackIcon className="h-4 w-4" />
                </button>
                <h2 className="text-sm font-medium text-foreground">
                  {CATEGORY_LABELS[activeCategory]}
                </h2>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="max-w-2xl">{content}</div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {!isOpen && (
        <header className="flex-shrink-0 border-b border-border-muted">
          <div className="px-4 py-3">
            <button
              onClick={toggle}
              className="p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              title={`Open sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
              aria-label={`Open sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
            >
              <SidebarIcon className="h-4 w-4" />
            </button>
          </div>
        </header>
      )}

      <div className="flex flex-1 overflow-hidden">
        <SettingsNav activeCategory={activeCategory} onSelect={setActiveCategory} />
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl">{content}</div>
        </div>
      </div>
    </div>
  );
}
