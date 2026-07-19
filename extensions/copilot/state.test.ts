/**
 * Coverage for resilient updates to the mutable Copilot model state.
 */

import type { OAuthCredentials } from "@earendil-works/pi-ai";
import type { ProviderConfig } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchCopilotModels } from "./api.js";
import { createCopilotState } from "./state.js";
import type { ModelResponse } from "./types.js";

vi.mock("./api.js", () => ({
  fetchCopilotModels: vi.fn(),
}));

const credentials: OAuthCredentials = {
  refresh: "github-token",
  access: "copilot-token",
  expires: Date.now() + 60_000,
};

const initialPayload: ModelResponse = {
  data: [{ id: "initial", model_picker_enabled: true }],
};

const refreshedPayload: ModelResponse = {
  data: [{ id: "refreshed", model_picker_enabled: true }],
};

describe("createCopilotState", () => {
  beforeEach(() => {
    vi.mocked(fetchCopilotModels).mockReset();
  });

  it("keeps the last usable payload when refreshing the model list fails", async () => {
    const providerConfig: ProviderConfig = {};
    const state = createCopilotState(providerConfig);
    state.setPayload(initialPayload);
    vi.mocked(fetchCopilotModels).mockResolvedValue(undefined);

    await expect(state.refresh(credentials.access, undefined, { force: true })).resolves.toBe(
      false,
    );

    expect(state.getPayload()).toBe(initialPayload);
    expect(providerConfig.models?.map((model) => model.id)).toEqual(["initial"]);
  });

  it("reprojects and reports a successful model refresh", async () => {
    const providerConfig: ProviderConfig = {};
    const state = createCopilotState(providerConfig);
    state.setPayload(initialPayload);
    vi.mocked(fetchCopilotModels).mockResolvedValue(refreshedPayload);

    await expect(state.refresh(credentials.access, undefined, { force: true })).resolves.toBe(true);

    expect(state.getPayload()).toBe(refreshedPayload);
    expect(providerConfig.models?.map((model) => model.id)).toEqual(["refreshed"]);
  });
});
