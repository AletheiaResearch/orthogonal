/**
 * Secret encryption (AES-256-GCM) for credentials at rest.
 *
 * Shared so the control plane and the Terminus gateway encrypt/decrypt identically.
 * Mirrors the original control-plane `auth/crypto.ts` scheme (12-byte IV prepended
 * to the ciphertext, base64-encoded) and adds an **optional** Additional
 * Authenticated Data (AAD) parameter: pass the owner id so ciphertext is
 * cryptographically bound to its owner and cannot be decrypted under another
 * (Helicone binds to `org_id` the same way). AAD is opt-in — omitting it is
 * byte-compatible with the no-AAD scheme, so existing ciphertext still decrypts.
 *
 * Key management: a base64-encoded 256-bit key stored as a Worker secret
 * (generate with `openssl rand -base64 32`).
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96-bit IV for GCM

function importKey(keyBase64: string) {
  const keyData = Uint8Array.from(atob(keyBase64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", keyData, { name: ALGORITHM, length: KEY_LENGTH }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function gcmParams(iv: Uint8Array, aad?: string) {
  const params: { name: string; iv: Uint8Array; additionalData?: Uint8Array } = {
    name: ALGORITHM,
    iv,
  };
  if (aad !== undefined) params.additionalData = new TextEncoder().encode(aad);
  return params;
}

/**
 * Encrypt a secret. Returns base64(IV ‖ ciphertext+tag). When `aad` is given,
 * decryption must supply the identical `aad` or it throws.
 */
export async function encryptSecret(
  plaintext: string,
  keyBase64: string,
  aad?: string
): Promise<string> {
  const key = await importKey(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    gcmParams(iv, aad),
    key,
    new TextEncoder().encode(plaintext)
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

/** Decrypt a secret produced by {@link encryptSecret}. Throws on a wrong key or AAD mismatch. */
export async function decryptSecret(
  encrypted: string,
  keyBase64: string,
  aad?: string
): Promise<string> {
  const key = await importKey(keyBase64);
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(gcmParams(iv, aad), key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

/** Generate a random base64-encoded 256-bit key (setup/tests). */
export function generateEncryptionKey(): string {
  const key = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...key));
}
