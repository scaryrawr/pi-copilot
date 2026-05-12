/**
 * On-disk cache for Copilot's `/models` response so cold starts stay snappy.
 */

import { readFile, writeFile } from "node:fs/promises";

import { CACHE_EXPIRY_MS, MODELS_CACHE } from "./constants.js";
import type { CachedModels, ModelResponse } from "./types.js";

/**
 * Load the cached `/models` payload if present and not yet expired.
 * Returns `undefined` on a miss, expiry, or any I/O error.
 */
export async function loadCachedModels(): Promise<CachedModels | undefined> {
  try {
    const raw = await readFile(MODELS_CACHE, "utf-8");
    const cached: CachedModels = JSON.parse(raw);
    const age = Date.now() - new Date(cached.cachedAt).getTime();
    return age < CACHE_EXPIRY_MS ? cached : undefined;
  } catch {
    return undefined;
  }
}

/** Persist the latest `/models` payload to disk. Failures are swallowed. */
export async function saveCachedModels(content: ModelResponse): Promise<void> {
  try {
    const entry: CachedModels = { content, cachedAt: new Date().toISOString() };
    await writeFile(MODELS_CACHE, JSON.stringify(entry, null, 2));
  } catch {
    // Best-effort cache; failures don't affect correctness.
  }
}
