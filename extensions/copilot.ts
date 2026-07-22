/**
 * GitHub Copilot provider extension for pi.
 *
 * Extends pi's built-in GitHub Copilot provider with account-specific model
 * discovery, refreshing through pi's provider lifecycle and the on-disk cache
 * at startup. The heavy lifting lives in `./copilot/*`; this file just composes
 * those modules into a `ProviderConfig` and registers it.
 */

import { type ExtensionAPI, type ProviderConfig } from "@earendil-works/pi-coding-agent";

import { loadCachedModels } from "./copilot/cache.js";
import { getEnterpriseDomain, loadStoredCopilotCredentials } from "./copilot/credentials.js";
import { createCopilotState } from "./copilot/state.js";

export default async function (pi: ExtensionAPI) {
  const providerConfig: ProviderConfig = {
    name: "GitHub Copilot",
  };

  const state = createCopilotState(providerConfig);

  async function refreshModels(
    accessToken: string,
    enterpriseDomain?: string,
    options?: { force?: boolean },
  ): Promise<void> {
    if (await state.refresh(accessToken, enterpriseDomain, options)) {
      pi.registerProvider("github-copilot", providerConfig);
    }
  }

  providerConfig.refreshModels = async (context) => {
    const credentials = context.credential;
    if (credentials?.type !== "oauth") return providerConfig.models ?? [];

    if (context.allowNetwork) {
      const options = context.force !== undefined ? { force: context.force } : undefined;
      await state.refresh(credentials.access, getEnterpriseDomain(credentials), options);
    } else {
      state.reproject(credentials.access, getEnterpriseDomain(credentials));
    }

    return providerConfig.models ?? [];
  };

  // Surface a warm cache before pi starts a session. It is refreshed below
  // using pi's OAuth-aware API-key resolution path.
  state.setPayload((await loadCachedModels())?.content);
  state.reproject();

  // Resolve the API key through pi's auth storage rather than reading the
  // access token from disk. This path refreshes and persists expired OAuth
  // credentials under pi's cross-process lock before model discovery.
  pi.on("session_start", async (_event, ctx) => {
    const accessToken = await ctx.modelRegistry.getApiKeyForProvider("github-copilot");
    if (!accessToken) return;

    const storedCredentials = await loadStoredCopilotCredentials();
    await refreshModels(
      accessToken,
      storedCredentials ? getEnterpriseDomain(storedCredentials) : undefined,
    );
  });

  pi.registerProvider("github-copilot", providerConfig);
}
