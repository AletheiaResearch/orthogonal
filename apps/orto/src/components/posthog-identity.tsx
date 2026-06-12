"use client";

import { useSession } from "next-auth/react";
import posthog from "posthog-js";
import { useEffect, useRef } from "react";

import { posthogEnabled } from "@/lib/posthog";

/**
 * Links PostHog events to the signed-in GitHub user.
 *
 * Identifies by the numeric GitHub user id (stable across username changes)
 * and refreshes person properties from the GitHub profile on every login.
 * PostHog's UI renders person avatars via Gravatar on `email`; the GitHub
 * picture is kept as the custom `avatar_url` property.
 */
export function PostHogIdentity() {
  const { data: session, status } = useSession();
  const identifiedId = useRef<string | null>(null);

  useEffect(() => {
    if (!posthogEnabled || status !== "authenticated") return;
    const user = session?.user;
    if (!user?.id || identifiedId.current === user.id) return;

    posthog.identify(user.id, {
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      github_login: user.login,
      avatar_url: user.image ?? undefined,
    });
    identifiedId.current = user.id;
  }, [status, session]);

  return null;
}
