import type { MetadataRoute } from "next";

import { getServerSideURL } from "@/lib/base-url";
import { isIndexable } from "@/lib/seo";

/**
 * robots.txt. During the "coming soon" phase (SITE_INDEXABLE unset) the whole
 * site is disallowed. Once indexing is enabled, crawling is allowed except the
 * admin + API, and the sitemap is advertised.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api"] },
    sitemap: `${getServerSideURL()}/sitemap.xml`,
  };
}
