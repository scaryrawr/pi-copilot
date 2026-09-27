/**
 * Copilot endpoint helpers.
 *
 * pi's built-in Copilot OAuth derives the same endpoints; we need the same
 * rules to call `/models` with the credentials pi resolved for us.
 */

import { INDIVIDUAL_BASE_URL } from "./constants.js";

/** Normalize a GitHub Enterprise URL or hostname to its hostname. */
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim();

  if (!trimmed) return null;

  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return null;
  }
}

/**
 * Resolve the credential-specific Copilot API endpoint from its proxy token,
 * with enterprise and individual fallbacks.
 */
export function getGitHubCopilotBaseUrl(accessToken?: string, enterpriseDomain?: string): string {
  const proxyHost = accessToken?.match(/proxy-ep=([^;]+)/)?.[1];

  if (proxyHost) return `https://${proxyHost.replace(/^proxy\./, "api.")}`;

  if (enterpriseDomain) return `https://copilot-api.${enterpriseDomain}`;

  return INDIVIDUAL_BASE_URL;
}
