import { describe, expect, it } from "vitest";

import { buildCanonicalRequest, deriveSigningKey, signS3Request } from "./sigv4";

/**
 * AWS Signature Version 4 conformance — the HMAC chain is pinned to AWS's PUBLISHED
 * derive-signing-key vector so any regression in the four-step `kSigning` derivation
 * (byte-order, raw-bytes-vs-hex chaining, the "AWS4" prefix, the terminator) is caught
 * by a known-answer test rather than by a live S3 401.
 *
 * Published vector (AWS `aws-sig-v4-test-suite` derive-key example):
 *   secret  = "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"   (NOTE the '+', not '/')
 *   date    = "20150830", region = "us-east-1", service = "iam"
 *   ⇒ kSigning hex = c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9
 */
const PUBLISHED_SECRET = "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY";
const PUBLISHED_KSIGNING_HEX = "c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9";

/** Hex-encode raw signing-key bytes for comparison with the published vector. */
function toHex(bytes: ArrayBuffer): string {
  let hex = "";
  for (const b of new Uint8Array(bytes)) hex += b.toString(16).padStart(2, "0");
  return hex;
}

describe("deriveSigningKey", () => {
  it("matches AWS's published derive-signing-key vector (raw-bytes HMAC chain)", async () => {
    const key = await deriveSigningKey(PUBLISHED_SECRET, "20150830", "us-east-1", "iam");
    expect(toHex(key)).toBe(PUBLISHED_KSIGNING_HEX);
  });

  it("changes when any scope component changes", async () => {
    const base = toHex(await deriveSigningKey(PUBLISHED_SECRET, "20150830", "us-east-1", "iam"));
    const otherDate = toHex(
      await deriveSigningKey(PUBLISHED_SECRET, "20150831", "us-east-1", "iam")
    );
    const otherRegion = toHex(
      await deriveSigningKey(PUBLISHED_SECRET, "20150830", "us-west-2", "iam")
    );
    const otherService = toHex(
      await deriveSigningKey(PUBLISHED_SECRET, "20150830", "us-east-1", "s3")
    );
    expect(otherDate).not.toBe(base);
    expect(otherRegion).not.toBe(base);
    expect(otherService).not.toBe(base);
  });
});

describe("buildCanonicalRequest", () => {
  it("emits the six-line canonical-request structure for a GET with a query", () => {
    const canonical = buildCanonicalRequest({
      method: "GET",
      url: new URL("https://examplebucket.s3.amazonaws.com/?list-type=2&max-keys=0"),
      payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      amzDate: "20150830T123600Z",
    });
    const lines = canonical.split("\n");

    // method \n canonicalURI \n canonicalQuery \n canonicalHeaders(+trailing\n) \n signedHeaders \n hashedPayload
    expect(lines[0]).toBe("GET");
    expect(lines[1]).toBe("/");
    // Query sorted + RFC3986-encoded, key=value joined by '&'.
    expect(lines[2]).toBe("list-type=2&max-keys=0");
    // Canonical headers: host, x-amz-content-sha256, x-amz-date — sorted, each "k:v\n".
    expect(canonical).toContain("host:examplebucket.s3.amazonaws.com\n");
    expect(canonical).toContain(
      "x-amz-content-sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n"
    );
    expect(canonical).toContain("x-amz-date:20150830T123600Z\n");
    // SignedHeaders line + hashed payload as the final two lines.
    expect(canonical).toContain("host;x-amz-content-sha256;x-amz-date");
    expect(lines[lines.length - 1]).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("sorts query parameters by key AFTER RFC3986 encoding", () => {
    const canonical = buildCanonicalRequest({
      method: "GET",
      url: new URL("https://b.s3.amazonaws.com/?prefix=a/b&list-type=2&max-keys=0"),
      payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      amzDate: "20150830T123600Z",
    });
    // RFC3986: '/' inside a value MUST be percent-encoded as %2F; keys sorted lexicographically.
    expect(canonical.split("\n")[2]).toBe("list-type=2&max-keys=0&prefix=a%2Fb");
  });
});

describe("signS3Request", () => {
  /** A request body with a known SHA-256, so x-amz-content-sha256 is assertable. */
  const BODY = new TextEncoder().encode('{"metrics":{}}');
  // sha256('{"metrics":{}}') precomputed below in the test itself via crypto.subtle.

  it("returns Authorization, x-amz-date, x-amz-content-sha256, and host headers", async () => {
    const headers = await signS3Request({
      method: "PUT",
      url: "https://examplebucket.s3.amazonaws.com/traces/_/x.json",
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "test-secret-key",
      body: BODY,
      nowMs: Date.parse("2015-08-30T12:36:00Z"),
    });

    expect(headers.host).toBe("examplebucket.s3.amazonaws.com");
    expect(headers["x-amz-date"]).toBe("20150830T123600Z");
    // x-amz-content-sha256 is the lowercase-hex SHA-256 of the body bytes.
    const digest = await crypto.subtle.digest("SHA-256", BODY);
    let want = "";
    for (const b of new Uint8Array(digest)) want += b.toString(16).padStart(2, "0");
    expect(headers["x-amz-content-sha256"]).toBe(want);

    // Authorization has the AWS4-HMAC-SHA256 shape with the right scope + 64-hex signature.
    expect(headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/20150830\/us-east-1\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/
    );
  });

  it("hashes the empty string for a body-less GET", async () => {
    const headers = await signS3Request({
      method: "GET",
      url: "https://examplebucket.s3.amazonaws.com/?list-type=2&max-keys=0",
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "test-secret-key",
      nowMs: Date.parse("2015-08-30T12:36:00Z"),
    });
    // Hash of "" — the well-known SHA-256 empty-string digest.
    expect(headers["x-amz-content-sha256"]).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("folds extraHeaders into the signed/canonical header set", async () => {
    const headers = await signS3Request({
      method: "PUT",
      url: "https://examplebucket.s3.amazonaws.com/x.json",
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "test-secret-key",
      body: BODY,
      extraHeaders: { "content-type": "application/json" },
      nowMs: Date.parse("2015-08-30T12:36:00Z"),
    });
    // content-type sorts before host and must appear in SignedHeaders.
    expect(headers.authorization).toContain(
      "SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date"
    );
  });

  it("reproduces AWS's published S3 'GET Object' full-request signature (end-to-end vector)", async () => {
    // AWS docs, "Signature Calculations for the Authorization Header" → Example: GET Object.
    // This anchors the WHOLE signing path (canonical request + string-to-sign + signing-key
    // derivation + final HMAC) to AWS truth, not just the kSigning step. The expected
    // signature is one of the most widely reproduced SigV4 vectors.
    const headers = await signS3Request({
      method: "GET",
      url: "https://examplebucket.s3.amazonaws.com/test.txt",
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      // No body → empty-payload hash, matching the example's x-amz-content-sha256.
      extraHeaders: { range: "bytes=0-9" },
      nowMs: Date.parse("2013-05-24T00:00:00Z"), // → x-amz-date 20130524T000000Z
    });
    expect(headers["x-amz-date"]).toBe("20130524T000000Z");
    expect(headers["x-amz-content-sha256"]).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    expect(headers.authorization).toContain(
      "Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request"
    );
    expect(headers.authorization).toContain(
      "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date"
    );
    // The published signature for this exact request.
    expect(headers.authorization).toContain(
      "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
    );
  });

  it("produces a deterministic signature for a fixed nowMs", async () => {
    const args = {
      method: "PUT" as const,
      url: "https://examplebucket.s3.amazonaws.com/x.json",
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "test-secret-key",
      body: BODY,
      nowMs: Date.parse("2015-08-30T12:36:00Z"),
    };
    const a = await signS3Request(args);
    const b = await signS3Request(args);
    expect(a.authorization).toBe(b.authorization);
  });
});
