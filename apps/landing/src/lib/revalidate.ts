import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { PayloadRequest } from "payload";

// Schedules revalidation to run *after* the response so it never executes during
// the admin's RSC render (Next 16 throws if revalidatePath runs during render).
// after() throws when called outside a request scope, so writes that bypass the
// disableRevalidate guard (e.g. migrations/jobs) are caught here instead of crashing.
export const deferRevalidate = (payload: PayloadRequest["payload"], paths: Set<string>) => {
  if (paths.size === 0) return;
  try {
    after(() => {
      for (const path of paths) {
        payload.logger.info(`Revalidating path: ${path}`);
        revalidatePath(path);
      }
    });
  } catch {
    payload.logger.warn("Skipping post revalidation: called outside a request scope");
  }
};
