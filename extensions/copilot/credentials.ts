/**
 * Credential helpers: read stored tokens from pi's auth file and pull the
 * enterprise domain out of an `OAuthCredentials` object.
 */

import { readFile } from "node:fs/promises";

import { type OAuthCredentials } from "@earendil-works/pi-ai";
import { normalizeDomain } from "@earendil-works/pi-ai/oauth";

import { AUTH_FILE } from "./constants.js";
import type { CopilotCredentials, Tokens } from "./types.js";

/**
 * Read Copilot credentials from `auth.json`.
 * Returns `undefined` if the file is missing, malformed, or lacks tokens.
 */
export async function loadStoredCopilotCredentials(): Promise<CopilotCredentials | undefined> {
  try {
    const auth: Tokens = JSON.parse(await readFile(AUTH_FILE, "utf-8"));
    const stored = auth["github-copilot"];
    if (typeof stored?.refresh !== "string" || typeof stored.access !== "string") {
      return undefined;
    }
    return {
      ...stored,
      refresh: stored.refresh,
      access: stored.access,
      expires: typeof stored.expires === "number" ? stored.expires : 0,
    };
  } catch {
    return undefined;
  }
}

/**
 * Extract the normalized enterprise domain from credentials, if any.
 * `enterpriseUrl` is optional / opaque, so it's parsed defensively.
 */
export function getEnterpriseDomain(credentials: OAuthCredentials): string | undefined {
  const enterpriseUrl = (credentials as { enterpriseUrl?: unknown }).enterpriseUrl;
  if (typeof enterpriseUrl !== "string") return undefined;
  return normalizeDomain(enterpriseUrl) ?? undefined;
}
