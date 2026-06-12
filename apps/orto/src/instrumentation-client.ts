import posthog from "posthog-js";

import { posthogEnabled } from "@/lib/posthog";

if (posthogEnabled) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
    // First-party proxy (see rewrites in next.config.ts) so ad blockers
    // don't drop events. US cloud.
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-01-30",
  });
}
