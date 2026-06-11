import { sessionMediaStreamRoutes } from "./session-media-stream";
import { sessionMediaUploadRoutes } from "./session-media-upload";
import type { Route } from "./shared";

export const sessionMediaRoutes: Route[] = [
  ...sessionMediaUploadRoutes,
  ...sessionMediaStreamRoutes,
];
