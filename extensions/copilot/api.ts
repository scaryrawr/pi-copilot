/**
 * HTTP client for Copilot's `/models` endpoint, with cache-first fetching.
 */

import { loadCachedModels, saveCachedModels } from "./cache.js";
import { getGitHubCopilotBaseUrl } from "./compat.js";
import {
  COPILOT_API_VERSION,
  COPILOT_HEADERS,
  MODELS_MAX_RETRIES,
  MODELS_REQUEST_TIMEOUT_MS,
  MODELS_RETRY_BUDGET_MS,
} from "./constants.js";
import { ModelResponseParser, type ModelResponse } from "./types.js";

/** Sleep until `ms` elapse or the signal aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Request `/models`, retrying rate limits the way Copilot's first-party
 * clients do: bounded attempts, `Retry-After` or exponential backoff, and a
 * total time budget shared with the caller's abort signal.
 */
async function fetchWithRateLimitRetry(
  url: string,
  headers: Record<string, string>,
  callerSignal?: AbortSignal,
): Promise<Response> {
  const deadline = Date.now() + MODELS_RETRY_BUDGET_MS;
  const budget = AbortSignal.timeout(MODELS_RETRY_BUDGET_MS);
  const signal = callerSignal ? AbortSignal.any([callerSignal, budget]) : budget;

  for (let attempt = 0; ; attempt++) {
    // Honor caller cancellation before every attempt, not just mid-sleep.
    if (signal.aborted) throw signal.reason;

    const response = await fetch(url, {
      headers,
      signal: AbortSignal.any([signal, AbortSignal.timeout(MODELS_REQUEST_TIMEOUT_MS)]),
    });
    if (response.status !== 429 || attempt === MODELS_MAX_RETRIES || signal.aborted)
      return response;

    let delayMs = 500 * 2 ** attempt;
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter !== null) {
      const seconds = Number.parseFloat(retryAfter);
      delayMs = Number.isNaN(seconds) ? Date.parse(retryAfter) - Date.now() : seconds * 1000;
      if (!Number.isFinite(delayMs)) return response;
    }
    delayMs = Math.max(0, delayMs);
    if (delayMs >= deadline - Date.now()) return response;

    await response.body?.cancel();
    await sleep(delayMs, signal);
  }
}

/**
 * Fetch the user's available Copilot models.
 *
 * Reads from the on-disk cache unless `force` is set, in which case the cache
 * is bypassed and refreshed. Network/parse failures resolve to `undefined`.
 */
export async function fetchCopilotModels(
  accessToken: string,
  enterpriseDomain?: string,
  options?: { force?: boolean; signal?: AbortSignal },
): Promise<ModelResponse | undefined> {
  if (!options?.force) {
    const cached = await loadCachedModels();
    if (cached) return cached.content;
  }

  try {
    const baseUrl = getGitHubCopilotBaseUrl(accessToken, enterpriseDomain);
    const response = await fetchWithRateLimitRetry(
      `${baseUrl}/models`,
      {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...COPILOT_HEADERS,
        "X-GitHub-Api-Version": COPILOT_API_VERSION,
      },
      options?.signal,
    );

    if (!response.ok) return undefined;

    const payload = ModelResponseParser.Decode(await response.json());
    await saveCachedModels(payload);
    return payload;
  } catch {
    return undefined;
  }
}
