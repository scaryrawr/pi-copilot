/**
 * Mutable lifecycle around the Copilot `/models` payload.
 *
 * Provider refreshes and the bootstrap path read and mutate the same two
 * pieces of state: the latest payload and the derived list installed on
 * `providerConfig`. Bundling that lifecycle in one place keeps the extension
 * entry readable.
 */

import { type ProviderConfig } from "@earendil-works/pi-coding-agent";

import { fetchCopilotModels } from "./api.js";
import { loadCuratedCopilotModels } from "./catalog.js";
import { getGitHubCopilotBaseUrl } from "./compat.js";
import { toProviderModelConfigs } from "./mapping.js";
import type { ModelResponse } from "./types.js";

/**
 * Stateful helper that owns the cached `/models` payload and knows how to
 * project it onto a `ProviderConfig`.
 */
export function createCopilotState(providerConfig: ProviderConfig) {
  let payload: ModelResponse | undefined;

  /**
   * Re-derive `providerConfig.models` from the current payload and API endpoint.
   * Without a payload we republish the curated catalog so the provider never
   * ends up with an empty model list.
   */
  async function reproject(accessToken?: string, enterpriseDomain?: string): Promise<void> {
    const baseUrl = getGitHubCopilotBaseUrl(accessToken, enterpriseDomain);
    providerConfig.baseUrl = baseUrl;
    providerConfig.models = toProviderModelConfigs(
      payload,
      baseUrl,
      await loadCuratedCopilotModels(),
    );
  }

  /**
   * Fetch a fresh `/models` payload for an already-resolved API key and update
   * the provider config. Returns whether a new usable payload was installed.
   * A discovery failure preserves the last known model list.
   */
  async function refresh(
    accessToken: string,
    enterpriseDomain?: string,
    options?: { force?: boolean; signal?: AbortSignal },
  ): Promise<boolean> {
    const next = await fetchCopilotModels(accessToken, enterpriseDomain, options);
    if (!next) {
      await reproject(accessToken, enterpriseDomain);
      return false;
    }

    payload = next;
    await reproject(accessToken, enterpriseDomain);
    return true;
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
