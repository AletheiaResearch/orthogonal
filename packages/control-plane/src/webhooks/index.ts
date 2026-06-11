/**
 * Webhook route exports.
 */

import type { Route } from "../routes/shared";
import { automationWebhookRoute } from "./automation-webhook";
import { githubAutomationEventRoute } from "./github";
import { sentryWebhookRoute } from "./sentry";

export const webhookRoutes: Route[] = [
  sentryWebhookRoute,
  automationWebhookRoute,
  githubAutomationEventRoute,
];
