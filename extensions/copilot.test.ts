/**
 * Coverage for the provider's authentication lifecycle wiring.
 */

import type { OAuthCredentials } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vitest";

import copilotExtension from "./copilot.js";
import { fetchCopilotModels } from "./copilot/api.js";

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
    registerProvider(_name: string, config: ProviderConfig) {
      registrations.push(config);
    },
  } as ExtensionAPI;

  await copilotExtension(pi);
  const oauth = registrations[0]?.oauth;
  expect(oauth).toBeDefined();

  await expect(oauth!.refreshToken(refreshedCredentials)).resolves.toBe(refreshedCredentials);
  expect(finishDiscovery).toBeDefined();
  expect(registrations).toHaveLength(1);

  finishDiscovery!({ data: [] });
  await vi.waitFor(() => expect(registrations).toHaveLength(2));
});
