/**
 * Coverage for projecting Copilot's account-specific `/models` payload into pi
 * model registrations.
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

import { INDIVIDUAL_BASE_URL } from "./constants.js";
import { populateCopilotModels, toProviderModelConfigs } from "./mapping.js";
import type { CopilotApiModel, ModelResponse } from "./types.js";

const ZERO_TEST_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

function piModel(id: string, provider = "github-copilot"): Model<Api> {
  return {
    id,
    name: `curated ${id}`,
    api: "anthropic-messages",
    provider,
    baseUrl: "https://old.example.test",
    reasoning: true,
    input: ["text"],
    cost: ZERO_TEST_COST,
    contextWindow: 111,
    maxTokens: 22,
  };
}

function apiModel(id: string, modelPickerEnabled = true): CopilotApiModel {
  return {
    id,
    model_picker_enabled: modelPickerEnabled,
    supported_endpoints: ["/chat/completions"],
    capabilities: {
      limits: {
        max_context_window_tokens: 1000,
        max_output_tokens: 100,
      },
      supports: { tool_calls: true },
    },
  };
}

function payload(models: CopilotApiModel[]): ModelResponse {
  return { data: models };
}

describe("populateCopilotModels", () => {
  it("removes built-in Copilot models that are missing or disabled in the payload", () => {
    const models = [
      piModel("available"),
      piModel("missing-from-api"),
      piModel("disabled-in-api"),
      piModel("policy-disabled"),
      piModel("no-tools"),
      piModel("other-provider", "openai"),
    ];

    const policyDisabled = { ...apiModel("policy-disabled"), policy: { state: "disabled" } };

    const noTools = {
      ...apiModel("no-tools"),
      capabilities: { limits: {}, supports: { tool_calls: false } },
    };

    const result = populateCopilotModels(
      models,
      payload([apiModel("available"), apiModel("disabled-in-api", false), policyDisabled, noTools]),
      "https://new.example.test",
    );

    expect(result.map((model) => `${model.provider}:${model.id}`)).toEqual([
      "openai:other-provider",
      "github-copilot:available",
    ]);
    expect(
      result.find((model) => model.id === "available" && model.provider === "github-copilot"),
    ).toMatchObject({
      api: "anthropic-messages",
      baseUrl: "https://new.example.test",
      contextWindow: 1000,
      maxTokens: 100,
      name: "curated available",
    });
  });

  it("preserves curated fields that Copilot does not report", () => {
    const curated = piModel("claude-opus-5.5");
    curated.thinkingLevelMap = { off: null, high: "high" };
    curated.cost = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };

    const [model] = populateCopilotModels(
      [curated],
      payload([apiModel("claude-opus-5.5")]),
      "https://new.example.test",
    );

    expect(model).toMatchObject({
      thinkingLevelMap: { off: null, high: "high" },
      cost: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
      contextWindow: 1000,
      maxTokens: 100,
    });
  });

  it("falls back to enabled policies when the individual endpoint reports no picker models", () => {
    const enabledByPolicy = { ...apiModel("enabled-only", false), policy: { state: "enabled" } };

    const fallback = populateCopilotModels([], payload([enabledByPolicy]), INDIVIDUAL_BASE_URL);

    const strict = populateCopilotModels(
      [],
      payload([enabledByPolicy]),
      "https://enterprise.example.test",
    );

    expect(fallback.map((model) => model.id)).toEqual(["enabled-only"]);
    expect(strict).toEqual([]);
  });
});

describe("toProviderModelConfigs", () => {
  it("uses curated models only as metadata for ids present in the payload", () => {
    const configs = toProviderModelConfigs(
      payload([apiModel("gpt-4o")]),
      "https://new.example.test",
      [piModel("gpt-4o"), piModel("not-in-payload")],
    );

    expect(configs.map((config) => config.id)).toEqual(["gpt-4o"]);
  });
});

/** A picker-enabled model whose `capabilities`/`billing` come from the caller. */
function richApiModel(
  id: string,
  capabilities: NonNullable<CopilotApiModel["capabilities"]>,
  billing?: CopilotApiModel["billing"],
): CopilotApiModel {
  const model: CopilotApiModel = {
    id,
    model_picker_enabled: true,
    supported_endpoints: ["/chat/completions"],
    capabilities,
  };

  if (billing !== undefined) model.billing = billing;

  return model;
}

describe("payload-only models", () => {
  it("carries Copilot's vision limits into pi input limits", () => {
    const vision = richApiModel("vision-model", {
      limits: {
        max_context_window_tokens: 200_000,
        max_output_tokens: 64_000,
        vision: { max_prompt_image_size: 3_145_728, max_prompt_images: 5 },
      },
      supports: { tool_calls: true, vision: true },
    });

    const [model] = populateCopilotModels([], payload([vision]), INDIVIDUAL_BASE_URL);

    expect(model?.input).toEqual(["text", "image"]);
    expect(model?.inputLimits?.images).toEqual({
      resize: { maxBytes: 3_145_728 },
      maxPerMessage: 5,
    });
  });

  it("prices models absent from the curated catalog from the payload billing block", () => {
    const priced = richApiModel(
      "priced-model",
      {
        limits: { max_context_window_tokens: 200_000, max_output_tokens: 64_000 },
        supports: { tool_calls: true },
      },
      {
        token_prices: {
          default: { input_price: 250, output_price: 1_500, cache_price: 25, cache_write_price: 0 },
        },
      },
    );

    const [model] = populateCopilotModels([], payload([priced]), INDIVIDUAL_BASE_URL);

    expect(model?.cost).toEqual({ input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0 });
  });

  it("keeps curated costs and thinking levels over payload-derived values", () => {
    const curated = {
      ...piModel("gpt-5.4"),
      cost: { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0 },
      thinkingLevelMap: { minimal: null },
    } satisfies Model<Api>;

    const fromPayload = richApiModel(
      "gpt-5.4",
      {
        limits: { max_context_window_tokens: 200_000, max_output_tokens: 64_000 },
        supports: { tool_calls: true },
      },
      { token_prices: { default: { input_price: 999_999 } } },
    );

    const [model] = populateCopilotModels([curated], payload([fromPayload]), INDIVIDUAL_BASE_URL);

    expect(model?.cost).toEqual(curated.cost);
    expect(model?.thinkingLevelMap).toEqual(curated.thinkingLevelMap);
  });

  it("treats adaptive thinking as reasoning support", () => {
    const adaptive = richApiModel("adaptive-model", {
      limits: { max_context_window_tokens: 200_000, max_output_tokens: 64_000 },
      supports: { tool_calls: true, adaptive_thinking: true },
    });

    const [model] = populateCopilotModels([], payload([adaptive]), INDIVIDUAL_BASE_URL);

    expect(model?.reasoning).toBe(true);
  });

  it("publishes the curated catalog instead of an empty list for a payload with no usable models", () => {
    const configs = toProviderModelConfigs(payload([]), INDIVIDUAL_BASE_URL, [piModel("gpt-4o")]);

    expect(configs.map((config) => config.id)).toEqual(["gpt-4o"]);
  });
});
