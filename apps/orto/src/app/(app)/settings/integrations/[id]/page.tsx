"use client";

import { INTEGRATION_DEFINITIONS, type IntegrationId } from "@open-inspect/shared";
import { SidebarIcon, BackIcon } from "@orthogonal/ui";
import Link from "next/link";
import { useParams } from "next/navigation";

import { CodeServerIntegrationSettings } from "@/components/settings/integrations/code-server-integration-settings";
import { GitHubIntegrationSettings } from "@/components/settings/integrations/github-integration-settings";
import { LinearIntegrationSettings } from "@/components/settings/integrations/linear-integration-settings";
import { SlackIntegrationSettings } from "@/components/settings/integrations/slack-integration-settings";
import { useSidebarContext } from "@/components/sidebar-layout";
import { useIsMobile } from "@/hooks/use-media-query";
import { SHORTCUT_LABELS } from "@/lib/keyboard-shortcuts";

function getIntegration(id: string) {
  return INTEGRATION_DEFINITIONS.find((d) => d.id === id);
}

function IntegrationDetail({ integrationId }: { integrationId: IntegrationId }) {
  if (integrationId === "github") return <GitHubIntegrationSettings />;
  if (integrationId === "linear") return <LinearIntegrationSettings />;
  if (integrationId === "code-server") return <CodeServerIntegrationSettings />;
  if (integrationId === "slack") return <SlackIntegrationSettings />;
  return null;
}

export default function IntegrationDetailPage() {
  const params = useParams<{ id: string }>();
  const { isOpen, toggle } = useSidebarContext();
  const isMobile = useIsMobile();

  const integration = getIntegration(params.id);

  if (!integration) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Integration not found.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex-shrink-0 border-b border-border-muted">
        <div className="flex items-center gap-2 px-4 py-3">
          {(!isOpen || isMobile) && (
            <button
              onClick={toggle}
              className="p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              title={`Open sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
              aria-label={`Open sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
            >
              <SidebarIcon className="h-4 w-4" />
            </button>
          )}
          <Link
            href="/settings?tab=integrations"
            className="p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Back to integrations"
          >
            <BackIcon className="h-4 w-4" />
          </Link>
          <h2 className="text-sm font-medium text-foreground">{integration.name}</h2>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-2xl">
          <IntegrationDetail integrationId={integration.id} />
        </div>
      </div>
    </div>
  );
}
