/**
 * AWS Signature Version 4 signer for the S3 broadcast destination (CON-73).
 *
 * Self-contained, S3-only, and built entirely on `crypto.subtle` — no `aws4fetch`, no
 * `@aws-sdk/*`, no Node `crypto`. The shared webhook HMAC helper (`hmac.ts`) returns a
 * hex STRING, which cannot seed the next HMAC in SigV4's key-derivation chain (each step
 * keys the next on the previous step's RAW BYTES), so this module carries its own
 * raw-bytes HMAC rather than reusing it.
 *
 * Scope is deliberately narrow: service is always `"s3"`, signing is header-based (not a
 * presigned query), and only the headers this adapter needs are signed. The HMAC chain is
 * pinned to AWS's published derive-signing-key vector in `sigv4.test.ts`.
 */

/** The SigV4 service this signer targets — fixed for the S3 destination. */
const SERVICE = "s3";
/** The SigV4 algorithm token (header-based, HMAC-SHA256). */
const ALGORITHM = "AWS4-HMAC-SHA256";
/** The credential-scope terminator. */
const TERMINATOR = "aws4_request";

const encoder = new TextEncoder();

/** SHA-256 of `bytes` as lowercase hex (used for both the payload hash and the canonical-request hash). */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

/** Lowercase-hex encode a byte view. */
function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/**
 * Raw-bytes HMAC-SHA256: keys on `key` (a string seed OR the previous step's raw bytes)
 * and returns the signature as an ArrayBuffer so it can seed the next HMAC. This is the
 * primitive SigV4's four-step key derivation chains over — hex would break the chain.
 */
async function hmac(key: ArrayBuffer | Uint8Array | string, message: string): Promise<ArrayBuffer> {
  const rawKey = typeof key === "string" ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
}

/**
 * Derive the SigV4 signing key as RAW BYTES:
 *   kDate    = HMAC("AWS4"+secret, yyyymmdd)
 *   kRegion  = HMAC(kDate, region)
 *   kService = HMAC(kRegion, "s3")
 *   kSigning = HMAC(kService, "aws4_request")
 * Each HMAC is keyed on the previous step's raw bytes (NOT its hex), per the AWS spec.
 * `service` is a parameter only so the test can pin AWS's published `iam` vector; the
 * S3 caller path always passes `SERVICE`.
 */
export async function deriveSigningKey(
  secretAccessKey: string,
  yyyymmdd: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const kDate = await hmac(`AWS4${secretAccessKey}`, yyyymmdd);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, TERMINATOR);
}

/**
 * RFC3986 percent-encoding for canonical query strings: encode every byte except the
 * unreserved set `A-Z a-z 0-9 - _ . ~`. `encodeURIComponent` leaves `!*'()` unescaped,
 * so we escape those too (AWS's `UriEncode` requirement).
 */
function rfc3986Encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/** A header map reduced to its signed, lowercase, trimmed canonical form. */
interface CanonicalHeaderSet {
  /** `"k:v\n"` lines, sorted by lowercase key. */
  canonicalHeaders: string;
  /** `;`-joined sorted lowercase header names. */
  signedHeaders: string;
}

/** Lowercase + trim a header map, sort by name, and render the canonical + signed forms. */
function canonicalizeHeaders(headers: Record<string, string>): CanonicalHeaderSet {
  const lowered = Object.entries(headers).map(
    ([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, " ")] as const
  );
  lowered.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    canonicalHeaders: lowered.map(([k, v]) => `${k}:${v}\n`).join(""),
    signedHeaders: lowered.map(([k]) => k).join(";"),
  };
}

/** Sort + RFC3986-encode a URL's query parameters into the canonical query string. */
function canonicalQueryString(url: URL): string {
  const pairs: Array<[string, string]> = [];
  for (const [k, v] of url.searchParams) pairs.push([rfc3986Encode(k), rfc3986Encode(v)]);
  // Sort by encoded key, then encoded value (AWS sorts AFTER encoding).
  pairs.sort(([ka, va], [kb, vb]) => (ka < kb ? -1 : ka > kb ? 1 : va < vb ? -1 : va > vb ? 1 : 0));
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
}

/** Inputs to render the SigV4 canonical request (the first hash input). */
export interface CanonicalRequestInput {
  method: string;
  url: URL;
  /** Lowercase-hex SHA-256 of the (already-encoded) body, or the empty-string hash. */
  payloadHash: string;
  /** The `x-amz-date` value (`yyyymmddThhmmssZ`). */
  amzDate: string;
  /** Extra headers to fold into the signed set (lowercased/trimmed here). */
  extraHeaders?: Record<string, string>;
}

/** The canonical request plus the signed-header list it was built from. */
interface CanonicalRequest {
  canonical: string;
  signedHeaders: string;
}

/**
 * Build the SigV4 canonical request string:
 *   method\nCanonicalURI\nCanonicalQueryString\nCanonicalHeaders\nSignedHeaders\nHashedPayload
 * `host`, `x-amz-content-sha256`, and `x-amz-date` are always signed; `extraHeaders`
 * (e.g. content-type, content-encoding) are merged in. The S3 path component is NOT
 * re-encoded here — `url.pathname` is already the encoded absolute path.
 */
function buildCanonicalRequestInternal(input: CanonicalRequestInput): CanonicalRequest {
  const headers: Record<string, string> = {
    host: input.url.host,
    "x-amz-content-sha256": input.payloadHash,
    "x-amz-date": input.amzDate,
    ...input.extraHeaders,
  };
  const { canonicalHeaders, signedHeaders } = canonicalizeHeaders(headers);
  const canonicalUri = input.url.pathname || "/";
  const canonical = [
    input.method,
    canonicalUri,
    canonicalQueryString(input.url),
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");
  return { canonical, signedHeaders };
}

/** Public canonical-request renderer (the string only) — exposed for conformance tests. */
export function buildCanonicalRequest(input: CanonicalRequestInput): string {
  return buildCanonicalRequestInternal(input).canonical;
}

/** Render epoch-ms as the SigV4 `x-amz-date` basic-format timestamp (`yyyymmddThhmmssZ`). */
function amzDateFromMs(ms: number): string {
  return new Date(ms).toISOString().replace(/[:-]|\.\d{3}/g, "");
}

/** Inputs for `signS3Request`. `body` is omitted for body-less GET/HEAD probes. */
export interface SignS3RequestInput {
  method: string;
  /** The full request URL (host + path + query) that will be fetched. */
  url: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** The exact body bytes that will be sent (already gzip-compressed if applicable). */
  body?: Uint8Array;
  /** Extra headers to sign (content-type, content-encoding). */
  extraHeaders?: Record<string, string>;
  /** Wall-clock epoch-ms for the signature timestamp — injected for deterministic tests. */
  nowMs: number;
}

/**
 * Sign an S3 request and return the headers to attach: `authorization`, `x-amz-date`,
 * `x-amz-content-sha256`, `host`, plus any `extraHeaders` (so the caller sends exactly
 * what was signed). The payload hash is the SHA-256 of `body` (or the empty-string hash
 * when there is no body, as for the ListObjectsV2 probe).
 */
export async function signS3Request(input: SignS3RequestInput): Promise<Record<string, string>> {
  const url = new URL(input.url);
  const amzDate = amzDateFromMs(input.nowMs);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(input.body ?? new Uint8Array(0));

  const { canonical, signedHeaders } = buildCanonicalRequestInternal({
    method: input.method,
    url,
    payloadHash,
    amzDate,
    extraHeaders: input.extraHeaders,
  });

  const scope = `${dateStamp}/${input.region}/${SERVICE}/${TERMINATOR}`;
  const stringToSign = [ALGORITHM, amzDate, scope, await sha256Hex(encoder.encode(canonical))].join(
    "\n"
  );

  const signingKey = await deriveSigningKey(
    input.secretAccessKey,
    dateStamp,
    input.region,
    SERVICE
  );
  const signature = bytesToHex(new Uint8Array(await hmac(signingKey, stringToSign)));

  const authorization =
    `${ALGORITHM} Credential=${input.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    authorization,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    host: url.host,
    ...input.extraHeaders,
  };
}
