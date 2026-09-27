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
