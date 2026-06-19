/**
 * SSRF guard for runtime-configurable destination URLs (CON-73).
 *
 * A destination URL is operator-supplied, so it is an SSRF vector: a webhook/OTLP/S3
 * URL pointing at `localhost`, a private range, or the cloud-metadata endpoint could
 * exfiltrate from inside the Worker's network. This guard (ported from Helicone's
 * webhook sender) enforces HTTPS-only and rejects loopback/private/link-local/
 * metadata hosts and internal TLDs.
 *
 * LIMITATION: this is a host-literal check, not DNS-rebinding-proof — a public
 * hostname that resolves to a private IP is not caught here (Workers `fetch` does the
 * resolution). Acceptable for an admin-gated config surface; documented so a future
 * resolve-then-check step is a known follow-up.
 */
export type UrlCheck = { ok: true } | { ok: false; reason: string };

const BLOCKED_EXACT_HOSTS = new Set(["localhost", "metadata.google.internal"]);
const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".corp", ".lan"];

/** Validate a destination URL. Returns `{ ok: false, reason }` for anything unsafe. */
export function checkDestinationUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, reason: "destination must use https" };
  }

  // URL.hostname keeps brackets for IPv6 literals (e.g. "[::1]"); strip them.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_EXACT_HOSTS.has(host)) {
    return { ok: false, reason: `blocked host: ${host}` };
  }
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, reason: `blocked host suffix: ${host}` };
  }
  if (isBlockedIpv4(host)) {
    return { ok: false, reason: `blocked IPv4: ${host}` };
  }
  if (isBlockedIpv6(host)) {
    return { ok: false, reason: `blocked IPv6: ${host}` };
  }
  return { ok: true };
}

/** Loopback / private / link-local / CGNAT / unspecified IPv4 (and malformed octets). */
function isBlockedIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  // A malformed/out-of-range literal is treated as unsafe (fail closed).
  if ([m[1], m[2], m[3], m[4]].some((o) => Number(o) > 255)) return true;
  if (a === 0) return true; // 0.0.0.0/8 (unspecified)
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private 172.16/12
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  return false;
}

/** Loopback / unspecified / unique-local (fc00::/7) / link-local (fe80::/10) IPv6. */
function isBlockedIpv6(host: string): boolean {
  if (!host.includes(":")) return false;
  if (host === "::1" || host === "::") return true;
  if (host.startsWith("fc") || host.startsWith("fd")) return true; // fc00::/7
  // fe80::/10 → first hextet fe80..febf.
  if (/^fe[89ab]/.test(host)) return true;
  return false;
}
