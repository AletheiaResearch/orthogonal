/** Whether the site should be search-indexable. False during coming-soon. */
export function isIndexable(): boolean {
  return process.env.SITE_INDEXABLE === "true";
}
