"use client";

import { RefreshRouteOnSave as PayloadLivePreview } from "@payloadcms/live-preview-react";
import { useRouter } from "next/navigation";
import React from "react";

/**
 * Mounted only in draft mode. Refreshes the route when an editor saves in the
 * Payload admin, so live preview reflects changes immediately.
 */
export const RefreshRouteOnSave: React.FC = () => {
  const router = useRouter();
  // The admin + this preview iframe are same-origin (relative live-preview URL),
  // so the parent's origin is exactly window.location.origin. The handshake does
  // an exact `event.origin === serverURL` check, so this must be the live origin
  // (not a build-time env var, which would be wrong across Vercel preview hosts).
  const serverURL = typeof window === "undefined" ? "" : window.location.origin;
  return <PayloadLivePreview refresh={router.refresh} serverURL={serverURL} />;
};
