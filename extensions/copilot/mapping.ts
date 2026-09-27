/**
 * Translate Copilot API entries into pi's `Model` and `ProviderModelConfig`
 * shapes, preserving any pre-existing curated fields for the same model id.
 */

import { type Api, type Model } from "@earendil-works/pi-ai";
import { type ProviderModelConfig } from "@earendil-works/pi-coding-agent";

import { COPILOT_HEADERS, INDIVIDUAL_BASE_URL, ZERO_COST } from "./constants.js";
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
 * Rebuild the Copilot model slice from the API/cache payload.
 *
 * The payload is authoritative for availability: existing built-in or user
 * entries are used only as metadata sources for ids that Copilot returned and
 * enabled for this account.
 */
function availableCopilotModels(
  payload: ModelResponse,
  baseUrl: string,
  existingModels: Model<Api>[],
): Model<Api>[] {
  // Individual accounts can report every picker flag as false while still
  // exposing enabled models, so only fall back to policy there.
  const apiModels = enabledCopilotModels(payload, baseUrl === INDIVIDUAL_BASE_URL);
  const availableIds = new Set(apiModels.map((model) => model.id));

  const existingById = new Map<string, Model<Api>>(
    existingModels.flatMap((model): [string, Model<Api>][] =>
      model.provider === "github-copilot" && availableIds.has(model.id) ? [[model.id, model]] : [],
    ),
  );

  return apiModels.map((apiModel) =>
    toCopilotModel(apiModel, baseUrl, existingById.get(apiModel.id)),
  );
}

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

  const model: Model<Api> = {
    id: apiModel.id,
    name: apiModel.name ?? existing?.name ?? apiModel.id,
    api,
    provider: "github-copilot",
    baseUrl,
    reasoning: existing?.reasoning ?? inferReasoning(apiModel, api),
    input: existing?.input ?? inferInput(apiModel),
    cost: existing?.cost ?? ZERO_COST,
    contextWindow,
    maxTokens,
    headers: existing?.headers ?? COPILOT_HEADERS,
  };

  if (existing?.thinkingLevelMap !== undefined) {
    model.thinkingLevelMap = existing.thinkingLevelMap;
  }

  if (existing?.promptCache !== undefined) {
    model.promptCache = existing.promptCache;
  }

  if (compat !== undefined) {
    model.compat = compat;
  }

  return model;
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

  const refreshed = availableCopilotModels(payload, baseUrl, rebased);

  // Replace the copilot slice with the refreshed entries.
  return [...rebased.filter((m) => m.provider !== "github-copilot"), ...refreshed];
}

/** Project a pi `Model` into the `ProviderModelConfig` shape pi expects. */
function toProviderModelConfig(model: Model<Api>): ProviderModelConfig {
  const config: ProviderModelConfig = {
    id: model.id,
    name: model.name,
    api: model.api,
    baseUrl: model.baseUrl,
    reasoning: model.reasoning,
    input: model.input,
    cost: model.cost,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  };

  if (model.thinkingLevelMap !== undefined) {
    config.thinkingLevelMap = model.thinkingLevelMap;
  }

  if (model.promptCache !== undefined) {
    config.promptCache = model.promptCache;
  }

  if (model.headers !== undefined) {
    config.headers = model.headers;
  }

  if (model.compat !== undefined) {
    config.compat = model.compat;
  }

  return config;
}

/**
 * Build the full list of `ProviderModelConfig` entries to register with pi,
 * folding in any pre-existing curated entries for the same model ids.
 *
 * Without a usable payload we must still publish something: an empty list would
 * wipe pi's Copilot catalog, so we republish the curated models instead.
 */
export function toProviderModelConfigs(
  payload: ModelResponse | undefined,
  baseUrl: string,
  curatedModels: readonly Model<Api>[],
): ProviderModelConfig[] {
  const available = payload ? availableCopilotModels(payload, baseUrl, [...curatedModels]) : [];

  const models =
    available.length > 0
      ? available
      : curatedModels.map((model) => ({ ...model, baseUrl }) satisfies Model<Api>);

  return models.map(toProviderModelConfig);
}
