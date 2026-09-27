/**
 * Curated Copilot catalog access.
 *
 * pi ships a static Copilot catalog and overlays a dynamically fetched one it
 * persists next to `auth.json`. Both carry curated metadata (real cost,
 * thinking levels, compat flags) that we want to keep when re-projecting the
 * account's `/models` payload, so we read both and let the dynamic overlay win.
 */

import { readFile } from "node:fs/promises";

import { type Api, type Model } from "@earendil-works/pi-ai";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";

import { MODELS_STORE } from "./constants.js";

/** Minimal shape of the `github-copilot` entry inside `models-store.json`. */
type StoredCatalogEntry = {
  models?: unknown;
};

/** Narrow an unknown catalog entry to a pi `Model` we can merge. */
function isModel(value: unknown): value is Model<Api> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { id?: unknown; name?: unknown; api?: unknown };
  return typeof candidate.id === "string" && typeof candidate.name === "string";
}

/**
 * Read pi's persisted dynamic catalog for Copilot.
 * Returns an empty list on a miss or any parse/IO failure.
 */
async function loadStoredCatalogModels(): Promise<Model<Api>[]> {
  try {
    const raw = await readFile(MODELS_STORE, "utf-8");
    const stored = (JSON.parse(raw) as Record<string, unknown>)?.["github-copilot"] as
      | StoredCatalogEntry
      | undefined;
    if (!Array.isArray(stored?.models)) return [];
    // pi persists the overlay with `provider` set; stamp it anyway so partial
    // payloads still project onto the right provider.
    return stored.models.filter(isModel).map((model) => ({ ...model, provider: "github-copilot" }));
  } catch {
    return [];
  }
}

/**
 * Load every curated Copilot model pi knows about: the built-in catalog plus
 * the persisted dynamic overlay, which takes precedence for shared ids.
 * Best-effort: a failing catalog source just yields fewer models.
 */
export async function loadCuratedCopilotModels(): Promise<Model<Api>[]> {
  let curated: Model<Api>[] = [];
  try {
    curated = [...getBuiltinModels("github-copilot")];
  } catch {
    curated = [];
  }
  for (const model of await loadStoredCatalogModels()) {
    const index = curated.findIndex((entry) => entry.id === model.id);
    if (index >= 0) curated[index] = model;
    else curated.push(model);
  }
  return curated;
}
