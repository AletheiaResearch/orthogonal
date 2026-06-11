"use client";

import { INTEGRATION_DEFINITIONS } from "@open-inspect/shared";
import Link from "next/link";

import { ChevronRightIcon } from "@/components/ui/icons";

export function IntegrationsSettings() {
  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-foreground">Integrations</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Choose an integration to configure its connection and behavior.
      </p>

      <div className="rounded-md border border-border-muted bg-background">
        <ul className="divide-y divide-border-muted">
          {INTEGRATION_DEFINITIONS.map((integration) => (
            <li key={integration.id}>
              <Link
                href={`/settings/integrations/${integration.id}`}
                className="hover:bg-muted/50 flex w-full items-start justify-between gap-2 px-4 py-3 text-muted-foreground transition hover:text-foreground"
              >
                <div>
                  <p className="text-sm font-medium">{integration.name}</p>
                  <p className="mt-1 text-xs">{integration.description}</p>
                </div>
                <ChevronRightIcon className="mt-0.5 h-4 w-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
