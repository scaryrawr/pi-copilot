/**
 * HTTP client for Copilot's `/models` endpoint, with cache-first fetching.
 */

import { getGitHubCopilotBaseUrl } from "@earendil-works/pi-ai/oauth";

import { loadCachedModels, saveCachedModels } from "./cache.js";
import { COPILOT_HEADERS, MODELS_REQUEST_TIMEOUT_MS } from "./constants.js";
import { ModelResponseParser, type ModelResponse } from "./types.js";

/**
 * Fetch the user's available Copilot models.
 *
 * Reads from the on-disk cache unless `force` is set, in which case the cache
 * is bypassed and refreshed. Network/parse failures resolve to `undefined`.
 */
export async function fetchCopilotModels(
  accessToken: string,
  enterpriseDomain?: string,
  options?: { force?: boolean },
): Promise<ModelResponse | undefined> {
  if (!options?.force) {
    const cached = await loadCachedModels();
    if (cached) return cached.content;
  }

  try {
    const baseUrl = getGitHubCopilotBaseUrl(accessToken, enterpriseDomain);
    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...COPILOT_HEADERS,
      },
      signal: AbortSignal.timeout(MODELS_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) return undefined;

    const payload = ModelResponseParser.Decode(await response.json());
    await saveCachedModels(payload);
    return payload;
  } catch {
    return undefined;
  }
}
