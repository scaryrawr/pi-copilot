/**
 * Coverage for the provider's authentication lifecycle wiring.
 */

import type { OAuthCredential, RefreshModelsContext } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import { beforeEach, expect, it, vi } from "vitest";

import copilotExtension from "./copilot.js";
import { fetchCopilotModels } from "./copilot/api.js";
import { loadStoredCopilotCredentials } from "./copilot/credentials.js";

const refreshedCredentials = {
  type: "oauth",
  refresh: "github-token",
  access: "new-copilot-token",
  expires: Date.now() + 60_000,
} satisfies OAuthCredential;

vi.mock("./copilot/compat.js", () => ({
  getGitHubCopilotBaseUrl: () => "https://api.example.test",
  getCuratedCopilotModels: () => [],
}));

vi.mock("./copilot/api.js", () => ({
  fetchCopilotModels: vi.fn(),
}));

vi.mock("./copilot/cache.js", () => ({
  loadCachedModels: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./copilot/credentials.js", () => ({
  getEnterpriseDomain: vi.fn().mockReturnValue(undefined),
  loadStoredCopilotCredentials: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.mocked(fetchCopilotModels).mockReset();
  vi.mocked(loadStoredCopilotCredentials).mockReset();
  vi.mocked(loadStoredCopilotCredentials).mockResolvedValue(undefined);
});

it("refreshes models through pi's provider refresh lifecycle", async () => {
  vi.mocked(fetchCopilotModels).mockResolvedValue({ data: [] });
  const registrations: ProviderConfig[] = [];
  const pi = {
    on: vi.fn(),
    registerProvider(_name: string, config: ProviderConfig) {
      registrations.push(config);
    },
  } as unknown as ExtensionAPI;

  await copilotExtension(pi);
  await registrations[0]!.refreshModels!({
    credential: refreshedCredentials,
    allowNetwork: true,
    force: true,
  } as RefreshModelsContext);

  expect(fetchCopilotModels).toHaveBeenCalledWith("new-copilot-token", undefined, { force: true });
});

it("discovers models with the API key resolved by pi's auth storage", async () => {
  type SessionContext = {
    modelRegistry: {
      getApiKeyForProvider(provider: string): Promise<string | undefined>;
    };
  };
  const sessionHandlers: Array<(event: unknown, ctx: SessionContext) => Promise<void>> = [];
  const registrations: ProviderConfig[] = [];
  const getApiKeyForProvider = vi.fn().mockResolvedValue("refreshed-copilot-token");
  vi.mocked(fetchCopilotModels).mockResolvedValue({
    data: [{ id: "discovered-model", model_picker_enabled: true }],
  });

  const pi = {
    on(event: string, handler: (event: unknown, ctx: SessionContext) => Promise<void>) {
      if (event === "session_start") sessionHandlers.push(handler);
    },
    registerProvider(_name: string, config: ProviderConfig) {
      registrations.push(config);
    },
  } as unknown as ExtensionAPI;

  await copilotExtension(pi);
  await sessionHandlers[0]?.({}, { modelRegistry: { getApiKeyForProvider } });

  expect(getApiKeyForProvider).toHaveBeenCalledWith("github-copilot");
  expect(fetchCopilotModels).toHaveBeenCalledWith("refreshed-copilot-token", undefined, undefined);
  expect(registrations).toHaveLength(2);
  expect(registrations[1]?.models?.map((model) => model.id)).toEqual(["discovered-model"]);
});
