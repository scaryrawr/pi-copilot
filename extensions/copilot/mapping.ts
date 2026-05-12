/**
 * Translate Copilot API entries into pi's `Model` and `ProviderModelConfig`
 * shapes, preserving any pre-existing curated fields for the same model id.
 */

import { getModels, type Api, type Model } from "@earendil-works/pi-ai";
import { type ProviderModelConfig } from "@earendil-works/pi-coding-agent";

import { COPILOT_HEADERS, ZERO_COST } from "./constants.js";
import {
  enabledCopilotModels,
  inferApi,
  inferCompat,
  inferInput,
  inferReasoning,
  positiveNumber,
} from "./inference.js";
import type { CopilotApiModel, ModelResponse } from "./types.js";

/**
 * Build a pi `Model` from a Copilot API entry.
 *
 * `existing` (if provided) is a previously-known model for the same id —
 * its already-curated fields win over fresh inference so user overrides and
 * hard-coded defaults are preserved.
 */
export function toCopilotModel(
  apiModel: CopilotApiModel,
  baseUrl: string,
  existing?: Model<Api>,
): Model<Api> {
  const api = existing?.api ?? inferApi(apiModel);
  const limits = apiModel.capabilities?.limits;
  const contextWindow = positiveNumber(
    limits?.max_context_window_tokens,
    existing?.contextWindow ?? 128000,
  );
  const maxTokens = positiveNumber(limits?.max_output_tokens, existing?.maxTokens ?? 16384);
  const compat = existing?.compat ?? inferCompat(apiModel, api);

  return {
    id: apiModel.id,
    name: apiModel.name ?? existing?.name ?? apiModel.id,
    api,
    provider: "github-copilot",
    baseUrl,
    reasoning: existing?.reasoning ?? inferReasoning(apiModel, api),
    ...(existing?.thinkingLevelMap !== undefined
      ? { thinkingLevelMap: existing.thinkingLevelMap }
      : {}),
    input: existing?.input ?? inferInput(apiModel),
    cost: existing?.cost ?? ZERO_COST,
    contextWindow,
    maxTokens,
    headers: existing?.headers ?? COPILOT_HEADERS,
    ...(compat !== undefined ? { compat } : {}),
  };
}

/**
 * Re-project an incoming list of pi models so Copilot entries reflect the
 * latest payload + base URL. Non-Copilot models pass through unchanged.
 *
 * Used as the `modifyModels` hook on the OAuth provider.
 */
export function populateCopilotModels(
  models: Model<Api>[],
  payload: ModelResponse | undefined,
  baseUrl: string,
): Model<Api>[] {
  // First, retarget any existing copilot models at the (possibly new) baseUrl.
  const rebased = models.map((model) =>
    model.provider === "github-copilot" ? { ...model, baseUrl } : model,
  );

  if (!payload) return rebased;

  // Index existing copilot models so we can preserve user-curated fields.
  const existingById = new Map(
    rebased.filter((m) => m.provider === "github-copilot").map((m) => [m.id, m]),
  );

  const refreshed = enabledCopilotModels(payload).map((apiModel) =>
    toCopilotModel(apiModel, baseUrl, existingById.get(apiModel.id)),
  );

  // Replace the copilot slice with the refreshed entries.
  return [...rebased.filter((m) => m.provider !== "github-copilot"), ...refreshed];
}

/** Project a pi `Model` into the `ProviderModelConfig` shape pi expects. */
function toProviderModelConfig(model: Model<Api>): ProviderModelConfig {
  return {
    id: model.id,
    name: model.name,
    api: model.api,
    baseUrl: model.baseUrl,
    reasoning: model.reasoning,
    ...(model.thinkingLevelMap !== undefined ? { thinkingLevelMap: model.thinkingLevelMap } : {}),
    input: model.input,
    cost: model.cost,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    ...(model.headers !== undefined ? { headers: model.headers } : {}),
    ...(model.compat !== undefined ? { compat: model.compat } : {}),
  };
}

/**
 * Build the full list of `ProviderModelConfig` entries to register with pi,
 * folding in any pre-existing curated entries for the same model ids.
 */
export function toProviderModelConfigs(
  payload: ModelResponse,
  baseUrl: string,
): ProviderModelConfig[] {
  const existingById = new Map(
    getModels("github-copilot").map((model) => [model.id, model as Model<Api>]),
  );

  return enabledCopilotModels(payload).map((apiModel) =>
    toProviderModelConfig(toCopilotModel(apiModel, baseUrl, existingById.get(apiModel.id))),
  );
}
