/**
 * Capability inference.
 *
 * Copilot's `/models` payload is rich but not always explicit about which pi
 * `Api` flavor to use, whether a model is reasoning-capable, etc. The helpers
 * here derive those fields from a mix of declared capabilities and id-based
 * heuristics, in that order of preference.
 */

import { type Api, type Model, type ModelImageInputLimits } from "@earendil-works/pi-ai";

import { ANTHROPIC_COMPAT, OPENAI_COMPLETIONS_COMPAT } from "./constants.js";
import type { CopilotApiModel, ModelResponse } from "./types.js";

/** True when Copilot's policy explicitly disables the model for this account. */
function policyDisabled(model: CopilotApiModel): boolean {
  return model.policy?.state === "disabled";
}

/** True when Copilot can use the model for tool calling; unusable otherwise. */
function toolsUsable(model: CopilotApiModel): boolean {
  return model.capabilities?.supports?.tool_calls !== false;
}

/**
 * Filter the payload down to models this account can actually use.
 *
 * Mirrors Copilot's own semantics: a model must support tool calls and appear
 * in the picker with a policy that is not disabled. `policyFallback` enables
 * the fallback Copilot needs for individual accounts that report every picker
 * flag as false while still exposing explicitly enabled models.
 */
export function enabledCopilotModels(
  payload: ModelResponse,
  policyFallback = false,
): CopilotApiModel[] {
  const candidates = payload.data.filter((model) => toolsUsable(model));

  const pickerModels = candidates.filter(
    (model) => model.model_picker_enabled === true && !policyDisabled(model),
  );

  if (pickerModels.length > 0 || !policyFallback) return pickerModels;

  return candidates.filter((model) => model.policy?.state === "enabled");
}

/** Return `value` when it's a finite positive number, else `fallback`. */
export function positiveNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Pick a pi `Api` based on the endpoints Copilot advertises for a model.
 *
 * Preference order: anthropic messages → openai responses → openai completions.
 * (Claude works best on `/v1/messages`, gpt-5* on `/responses`.)
 */
function inferApiFromEndpoints(endpoints: readonly string[]): Api | undefined {
  if (endpoints.includes("/v1/messages")) return "anthropic-messages";

  if (endpoints.some((e) => e === "/responses" || e === "ws:/responses")) {
    return "openai-responses";
  }

  if (endpoints.includes("/chat/completions")) return "openai-completions";

  return undefined;
}

/** Fallback `Api` inference when no endpoints are declared. */
function inferApiFromId(modelId: string): Api {
  if (modelId.startsWith("claude-")) return "anthropic-messages";

  if (modelId.startsWith("gpt-5") || /^o\d/.test(modelId)) return "openai-responses";

  return "openai-completions";
}

/** Best-effort `Api` selection for a Copilot model. */
export function inferApi(apiModel: CopilotApiModel): Api {
  const endpoints = apiModel.supported_endpoints;

  if (Array.isArray(endpoints) && endpoints.length > 0) {
    const fromEndpoints = inferApiFromEndpoints(endpoints);

    if (fromEndpoints !== undefined) return fromEndpoints;
  }

  return inferApiFromId(apiModel.id);
}

/** True iff Copilot declares any `reasoning_effort` levels for the model. */
function supportsReasoningEffort(apiModel: CopilotApiModel): boolean {
  const efforts = apiModel.capabilities?.supports?.reasoning_effort;

  return Array.isArray(efforts) && efforts.length > 0;
}

/** True iff Copilot declares a positive `max_thinking_budget` for the model. */
function supportsThinkingBudget(apiModel: CopilotApiModel): boolean {
  const budget = apiModel.capabilities?.supports?.max_thinking_budget;

  return budget !== undefined && budget > 0;
}

/** True iff Copilot advertises Anthropic adaptive thinking for the model. */
function supportsAdaptiveThinking(apiModel: CopilotApiModel): boolean {
  return apiModel.capabilities?.supports?.adaptive_thinking === true;
}

/**
 * Decide whether to expose the model as reasoning-capable.
 *
 * Prefers explicit capability flags. If Copilot omits the `supports` block
 * entirely we fall back to an API-based heuristic (claude / o-series / gpt-5
 * are reasoning models).
 */
export function inferReasoning(apiModel: CopilotApiModel, api: Api): boolean {
  if (supportsReasoningEffort(apiModel) || supportsThinkingBudget(apiModel)) return true;

  // Adaptive thinking is reasoning even when no effort levels are advertised.
  if (supportsAdaptiveThinking(apiModel)) return true;

  if (apiModel.capabilities?.supports === undefined) {
    return api === "anthropic-messages" || api === "openai-responses";
  }

  return false;
}

/** Decide the input modalities the model accepts. */
export function inferInput(apiModel: CopilotApiModel): ("text" | "image")[] {
  const vision = apiModel.capabilities?.supports?.vision;

  if (vision === true) return ["text", "image"];

  if (vision === false) return ["text"];

  // Unknown capability — keep the prior id-based default.
  return apiModel.id.startsWith("grok-code-") ? ["text"] : ["text", "image"];
}

/**
 * Project Copilot's vision limits onto pi's cache-safe image input limits.
 *
 * Copilot reports per-message image counts and a per-image byte ceiling; pi
 * uses those to resize images before they enter conversation history.
 * Returns `undefined` when Copilot publishes no vision limits.
 */
export function inferInputLimits(
  apiModel: CopilotApiModel,
  input: readonly ("text" | "image")[],
): Model<Api>["inputLimits"] | undefined {
  if (!input.includes("image")) return undefined;

  const vision = apiModel.capabilities?.limits?.vision;

  if (vision === undefined) return undefined;

  const maxBytes = positiveNumber(vision.max_prompt_image_size, 0);
  const maxPerMessage = positiveNumber(vision.max_prompt_images, 0);

  const images: ModelImageInputLimits = {};

  if (maxBytes > 0) images.resize = { maxBytes };

  if (maxPerMessage > 0) images.maxPerMessage = maxPerMessage;

  return Object.keys(images).length > 0 ? { images } : undefined;
}

/**
 * Derive pi's per-million-token cost from Copilot's billing block.
 *
 * Copilot reports `token_prices.default` in **cents** per million tokens, so
 * we divide by 100. Models that bill by premium request report all zeros, and
 * missing prices fall back to `undefined` so the caller can keep its own
 * default. Copilot's payload carries no long-context tier information, so the
 * derived cost never includes `tiers`.
 */
export function inferCost(apiModel: CopilotApiModel): Model<Api>["cost"] | undefined {
  const prices = apiModel.billing?.token_prices?.default;

  if (prices === undefined) return undefined;

  const cost: Model<Api>["cost"] = {
    input: nonNegativeNumber(prices.input_price) / 100,
    output: nonNegativeNumber(prices.output_price) / 100,
    cacheRead: nonNegativeNumber(prices.cache_price) / 100,
    cacheWrite: nonNegativeNumber(prices.cache_write_price) / 100,
  };

  return cost;
}

/** Finite non-negative number, else `0`. */
function nonNegativeNumber(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Compat flags pi needs to dial back features unsupported on Copilot. */
export function inferCompat(apiModel: CopilotApiModel, api: Api): Model<Api>["compat"] | undefined {
  if (api === "openai-completions") {
    return {
      ...OPENAI_COMPLETIONS_COMPAT,
      supportsReasoningEffort: supportsReasoningEffort(apiModel),
    };
  }

  if (api === "anthropic-messages") return ANTHROPIC_COMPAT;

  return undefined;
}
