import config from "@payload-config";
import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";

/**
 * Live-preview entry point. Verifies the preview secret + an authenticated
 * Payload user, enables draft mode, then redirects to the requested path so the
 * post renders its latest draft inside the admin iframe.
 */
export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");
  const previewSecret = searchParams.get("previewSecret");

  if (previewSecret !== process.env.PREVIEW_SECRET) {
    return new Response("You are not allowed to preview this page", { status: 403 });
  }
  if (!path?.startsWith("/")) {
    return new Response("This endpoint can only be used for relative previews", { status: 400 });
  }

  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: req.headers });

  const draft = await draftMode();
  if (!user) {
    draft.disable();
    return new Response("You are not allowed to preview this page", { status: 403 });
  }

  draft.enable();
  redirect(path);
}
