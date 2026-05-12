/**
 * Mutable lifecycle around the Copilot `/models` payload.
 *
 * The OAuth callbacks (login / refreshToken / modifyModels) and the bootstrap
 * path all read and mutate the same two pieces of state: the latest payload
 * and the derived list installed on `providerConfig`. Bundling that lifecycle
 * in one place keeps the extension entry readable.
 */

import { type OAuthCredentials } from "@earendil-works/pi-ai";
import { getGitHubCopilotBaseUrl } from "@earendil-works/pi-ai/oauth";
import { type ProviderConfig } from "@earendil-works/pi-coding-agent";

import { fetchCopilotModels } from "./api.js";
import { getEnterpriseDomain } from "./credentials.js";
import { toProviderModelConfigs } from "./mapping.js";
import type { ModelResponse } from "./types.js";

/**
 * Stateful helper that owns the cached `/models` payload and knows how to
 * project it onto a `ProviderConfig`.
 */
export function createCopilotState(providerConfig: ProviderConfig) {
  let payload: ModelResponse | undefined;

  /** Re-derive `providerConfig.models` from the current payload + credentials. */
  function reproject(credentials?: OAuthCredentials): void {
    if (!payload) return;
    const domain = credentials ? getEnterpriseDomain(credentials) : undefined;
    const baseUrl = getGitHubCopilotBaseUrl(credentials?.access, domain);
    providerConfig.baseUrl = baseUrl;
    providerConfig.models = toProviderModelConfigs(payload, baseUrl);
  }

  /**
   * Fetch a fresh `/models` payload for the given credentials and update the
   * provider config. Used after login and token refresh.
   */
  async function refresh(credentials: OAuthCredentials, options?: { force?: boolean }) {
    payload = await fetchCopilotModels(
      credentials.access,
      getEnterpriseDomain(credentials),
      options,
    );
    reproject(credentials);
  }

  /** Snapshot of the latest payload (used by `modifyModels`). */
  function getPayload(): ModelResponse | undefined {
    return payload;
  }

  /** Seed the payload directly (used during bootstrap). */
  function setPayload(next: ModelResponse | undefined): void {
    payload = next;
  }

  return { getPayload, setPayload, reproject, refresh };
}
