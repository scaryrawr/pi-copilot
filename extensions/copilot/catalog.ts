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
import { Type } from "typebox";
import { Value } from "typebox/value";

import { MODELS_STORE } from "./constants.js";

/**
 * Identity contract for persisted overlay entries. pi stores full `Model`
 * records (and occasionally junk) there; the wrapper tolerates any entry
 * value and `isModel` validates each one we actually merge.
 */
const StoredModelSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
});

const CopilotStoreSchema = Type.Object({
  "github-copilot": Type.Optional(
    Type.Object({
      models: Type.Optional(Type.Array(Type.Unknown())),
    }),
  ),
});

function isModel(value: unknown): value is Model<Api> {
  return Value.Check(StoredModelSchema, value);
}

/**
 * Read pi's persisted dynamic catalog for Copilot.
 * Returns an empty list on a miss or any parse/IO failure.
 */
async function loadStoredCatalogModels(): Promise<Model<Api>[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(MODELS_STORE, "utf-8"));

    if (!Value.Check(CopilotStoreSchema, parsed)) return [];

    const models = parsed["github-copilot"]?.models ?? [];

    // pi persists the overlay with `provider` set; stamp it anyway so partial
    // payloads still project onto the right provider.
    return models.flatMap((model) =>
      isModel(model) ? [{ ...model, provider: "github-copilot" }] : [],
    );
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
