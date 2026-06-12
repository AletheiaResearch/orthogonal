/**
 * Validation patterns for dynamic route parameters that are interpolated
 * into control-plane URLs. Rejecting unexpected characters (and bare "." /
 * ".." segments) prevents authenticated users from steering requests at
 * unintended control-plane endpoints.
 */

/** Control-plane generated IDs: hex from generateId(), UUID-style values. */
export const ID_PATTERN = /^[A-Za-z0-9-]+$/;

/** GitHub owner / repository name segments; rejects bare "." and "..". */
export const GITHUB_NAME_PATTERN = /^(?!\.{1,2}$)[A-Za-z0-9_.-]+$/;

/** Secret keys, mirroring what the secrets editor allows users to create. */
export const SECRET_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
