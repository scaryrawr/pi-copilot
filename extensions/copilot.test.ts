/**
 * Coverage for the provider's authentication lifecycle wiring.
 */

import type { OAuthCredentials } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import { beforeEach, expect, it, vi } from "vitest";

import copilotExtension from "./copilot.js";
import { fetchCopilotModels } from "./copilot/api.js";
import { loadStoredCopilotCredentials } from "./copilot/credentials.js";

const { refreshedCredentials } = vi.hoisted(() => ({
  refreshedCredentials: {
    refresh: "github-token",
    access: "new-copilot-token",
    expires: Date.now() + 60_000,
  } satisfies OAuthCredentials,
}));

vi.mock("@earendil-works/pi-ai/oauth", () => ({
  getGitHubCopilotBaseUrl: () => "https://api.example.test",
  githubCopilotOAuthProvider: {
    name: "GitHub Copilot",
    login: vi.fn(),
    refreshToken: vi.fn().mockResolvedValue(refreshedCredentials),
    getApiKey: (credentials: OAuthCredentials) => credentials.access,
  },
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

it("does not hold token refresh open while model discovery runs", async () => {
  let finishDiscovery: ((value: { data: [] }) => void) | undefined;
  vi.mocked(fetchCopilotModels).mockImplementation(
    () =>
      new Promise((resolve) => {
        finishDiscovery = resolve;
      }),
  );

  const registrations: ProviderConfig[] = [];
  const pi = {
    on: vi.fn(),
    registerProvider(_name: string, config: ProviderConfig) {
      registrations.push(config);
    },
  } as unknown as ExtensionAPI;

  await copilotExtension(pi);
  const oauth = registrations[0]?.oauth;
  expect(oauth).toBeDefined();

  await expect(oauth!.refreshToken(refreshedCredentials)).resolves.toBe(refreshedCredentials);
  expect(finishDiscovery).toBeDefined();
  expect(registrations).toHaveLength(1);

  finishDiscovery!({ data: [] });
  await vi.waitFor(() => expect(registrations).toHaveLength(2));
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
