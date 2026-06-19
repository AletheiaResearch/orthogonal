import { describe, expect, it } from "vitest";

import { checkDestinationUrl } from "./ssrf";

describe("checkDestinationUrl", () => {
  it("allows a normal public https URL (incl. a non-standard port)", () => {
    expect(checkDestinationUrl("https://api.posthog.com/i/v0/e/").ok).toBe(true);
    expect(checkDestinationUrl("https://example.com:8443/v1/traces").ok).toBe(true);
  });

  it("rejects non-https schemes", () => {
    expect(checkDestinationUrl("http://example.com").ok).toBe(false);
    expect(checkDestinationUrl("ftp://example.com").ok).toBe(false);
  });

  it("rejects localhost and loopback", () => {
    expect(checkDestinationUrl("https://localhost/x").ok).toBe(false);
    expect(checkDestinationUrl("https://127.0.0.1/x").ok).toBe(false);
    expect(checkDestinationUrl("https://127.5.5.5/x").ok).toBe(false);
    expect(checkDestinationUrl("https://[::1]/x").ok).toBe(false);
  });

  it("rejects private + link-local + CGNAT IPv4 ranges", () => {
    for (const h of [
      "10.0.0.1",
      "172.16.5.4",
      "172.31.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
    ]) {
      expect(checkDestinationUrl(`https://${h}/x`).ok, h).toBe(false);
    }
  });

  it("allows public IPv4 just outside the 172.16/12 block", () => {
    expect(checkDestinationUrl("https://172.32.0.1/x").ok).toBe(true);
    expect(checkDestinationUrl("https://172.15.0.1/x").ok).toBe(true);
  });

  it("rejects cloud-metadata host and internal suffixes", () => {
    expect(checkDestinationUrl("https://metadata.google.internal/x").ok).toBe(false);
    expect(checkDestinationUrl("https://foo.internal/x").ok).toBe(false);
    expect(checkDestinationUrl("https://db.local/x").ok).toBe(false);
    expect(checkDestinationUrl("https://x.corp/x").ok).toBe(false);
    expect(checkDestinationUrl("https://y.lan/x").ok).toBe(false);
  });

  it("rejects IPv6 link-local and unique-local", () => {
    expect(checkDestinationUrl("https://[fe80::1]/x").ok).toBe(false);
    expect(checkDestinationUrl("https://[fd00::1]/x").ok).toBe(false);
    expect(checkDestinationUrl("https://[fc00::1]/x").ok).toBe(false);
  });

  it("rejects a malformed URL", () => {
    expect(checkDestinationUrl("not a url").ok).toBe(false);
    expect(checkDestinationUrl("").ok).toBe(false);
  });

  it("rejects trailing-dot variants of blocked hosts", () => {
    expect(checkDestinationUrl("https://localhost./x").ok).toBe(false);
    expect(checkDestinationUrl("https://metadata.google.internal./x").ok).toBe(false);
    expect(checkDestinationUrl("https://foo.internal./x").ok).toBe(false);
  });

  it("rejects IPv4-mapped IPv6 of private/loopback/metadata", () => {
    expect(checkDestinationUrl("https://[::ffff:10.0.0.1]/x").ok).toBe(false);
    expect(checkDestinationUrl("https://[::ffff:127.0.0.1]/x").ok).toBe(false);
    expect(checkDestinationUrl("https://[::ffff:169.254.169.254]/x").ok).toBe(false);
    expect(checkDestinationUrl("https://[::ffff:192.168.1.1]/x").ok).toBe(false);
  });

  it("allows an IPv4-mapped public address", () => {
    expect(checkDestinationUrl("https://[::ffff:8.8.8.8]/x").ok).toBe(true);
  });

  it("rejects a URL carrying credentials (userinfo)", () => {
    expect(checkDestinationUrl("https://user:pass@example.com/x").ok).toBe(false);
    expect(checkDestinationUrl("https://user@example.com/x").ok).toBe(false);
  });
});
