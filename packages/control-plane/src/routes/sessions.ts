import { sessionChildSpawnRoutes } from "./session-child-spawn";
import { sessionChildRoutes } from "./session-children";
import { sessionCreateRoutes } from "./session-create";
import { sessionIndexRoutes } from "./session-index";
import { sessionMediaRoutes } from "./session-media";
import { sessionPromptRoutes } from "./session-prompt";
import { sessionRuntimeProxyRoutes } from "./session-runtime-proxy";
import { sessionWsTokenRoutes } from "./session-ws-token";
import type { Route } from "./shared";

export const sessionRoutes: Route[] = [
  ...sessionCreateRoutes,
  ...sessionIndexRoutes,
  ...sessionRuntimeProxyRoutes,
  ...sessionWsTokenRoutes,
  ...sessionPromptRoutes,
  ...sessionMediaRoutes,
  ...sessionChildSpawnRoutes,
  ...sessionChildRoutes,
];
