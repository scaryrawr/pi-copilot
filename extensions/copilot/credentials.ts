/**
 * Credential helpers: read stored tokens from pi's auth file and pull the
 * enterprise domain out of an `OAuthCredentials` object.
 */

import { readFile } from "node:fs/promises";

import type { OAuthCredentials } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { Value } from "typebox/value";

import { normalizeDomain } from "./compat.js";
import { AUTH_FILE } from "./constants.js";

const StringSchema = Type.String();

/** Stored Copilot credential shape we require from `auth.json`. */
const StoredCredentialSchema = Type.Object({
  refresh: Type.String(),
  access: Type.String(),
  expires: Type.Optional(Type.Number()),
});

/** Top-level `auth.json` shape we care about. Unknown keys are tolerated. */
const AuthFileSchema = Type.Object({
  "github-copilot": Type.Optional(StoredCredentialSchema),
});

/**
 * Read Copilot credentials from `auth.json`.
 * Returns `undefined` if the file is missing, malformed, or lacks tokens.
 */
export async function loadStoredCopilotCredentials(): Promise<OAuthCredentials | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(AUTH_FILE, "utf-8"));

    if (!Value.Check(AuthFileSchema, parsed)) return undefined;

    const stored = parsed["github-copilot"];

    if (stored === undefined) return undefined;

    return { ...stored, expires: stored.expires ?? 0 };
  } catch {
    return undefined;
  }
}

/**
 * Extract the normalized enterprise domain from credentials, if any.
 * `enterpriseUrl` sits behind an open index signature, so it is validated
 * before use.
 */
export function getEnterpriseDomain(credentials: OAuthCredentials): string | undefined {
  const enterpriseUrl: unknown = credentials.enterpriseUrl;

  if (!Value.Check(StringSchema, enterpriseUrl)) return undefined;

  return normalizeDomain(enterpriseUrl) ?? undefined;
}
