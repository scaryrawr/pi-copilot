/**
 * Compatibility adapters for pi's built-in GitHub Copilot provider.
 *
 * pi's extension loader exposes the legacy catalog through its compatibility
 * entry point, while current package typings expose only the new models API.
 */

import * as piAi from "@earendil-works/pi-ai";
import { type Api, type Model } from "@earendil-works/pi-ai";

type LegacyCatalog = {
  getModels?(provider: string): readonly Model<Api>[];
};

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
  return "https://api.individual.githubcopilot.com";
}

/** Return pi's current curated Copilot catalog for metadata preservation. */
export function getCuratedCopilotModels(): readonly Model<Api>[] {
  return (piAi as LegacyCatalog).getModels?.("github-copilot") ?? [];
}
