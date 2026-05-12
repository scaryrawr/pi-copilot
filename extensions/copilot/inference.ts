/**
 * Capability inference.
 *
 * Copilot's `/models` payload is rich but not always explicit about which pi
 * `Api` flavor to use, whether a model is reasoning-capable, etc. The helpers
 * here derive those fields from a mix of declared capabilities and id-based
 * heuristics, in that order of preference.
 */

import { type Api, type Model } from "@earendil-works/pi-ai";

import { ANTHROPIC_COMPAT, OPENAI_COMPLETIONS_COMPAT } from "./constants.js";
import type { CopilotApiModel, ModelResponse } from "./types.js";

/** Filter the payload down to models surfaced in Copilot's picker. */
export function enabledCopilotModels(payload: ModelResponse): CopilotApiModel[] {
  return payload.data.filter((model) => model.model_picker_enabled === true);
}

/** Return `value` when it's a finite positive number, else `fallback`. */
export function positiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
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
  return typeof budget === "number" && budget > 0;
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
