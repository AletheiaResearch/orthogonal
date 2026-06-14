/**
 * Public base URL for media served from R2 (no trailing slash). Set
 * R2_PUBLIC_URL to the bucket's public custom domain; falls back to the
 * canonical Orthogonal chronicles domain when unset.
 */
const r2PublicUrl = process.env.R2_PUBLIC_URL?.trim();
export const R2_PUBLIC_BASE = (r2PublicUrl || "https://chronicles.orto.sh").replace(/\/+$/, "");
