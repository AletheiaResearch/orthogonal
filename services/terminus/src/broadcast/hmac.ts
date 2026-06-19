/**
 * HMAC-SHA256 over the Web Crypto API (`crypto.subtle`) — Workers-native, no Node
 * `crypto`. Used to sign outbound webhook bodies so receivers can verify authenticity
 * (Helicone's `Helicone-Signature` pattern).
 */

/** HMAC-SHA256 of `message` under `key`, returned as lowercase hex. */
export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  let hex = "";
  for (const b of new Uint8Array(signature)) hex += b.toString(16).padStart(2, "0");
  return hex;
}
