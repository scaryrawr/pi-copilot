/**
 * GitHub Copilot provider extension for pi.
 *
 * Wires GitHub's OAuth flow into pi, then refreshes the user's available
 * Copilot model list on login, token refresh, and from the on-disk cache at
 * startup. The heavy lifting lives in `./copilot/*`; this file just composes
 * those modules into a `ProviderConfig` and registers it.
 */

import { type OAuthCredentials } from "@earendil-works/pi-ai";
import { githubCopilotOAuthProvider, getGitHubCopilotBaseUrl } from "@earendil-works/pi-ai/oauth";
import { type ExtensionAPI, type ProviderConfig } from "@earendil-works/pi-coding-agent";

import { loadCachedModels } from "./copilot/cache.js";
import { getEnterpriseDomain, loadStoredCopilotCredentials } from "./copilot/credentials.js";
import { populateCopilotModels } from "./copilot/mapping.js";
import { createCopilotState } from "./copilot/state.js";

export default async function (pi: ExtensionAPI) {
  const providerConfig: ProviderConfig = {
    name: githubCopilotOAuthProvider.name,
    oauth: {
      name: githubCopilotOAuthProvider.name,

      async login(callbacks) {
        const next = await githubCopilotOAuthProvider.login(callbacks);
        scheduleModelRefresh(next);
        return next;
      },

      async refreshToken(currentCredentials) {
        const next = await githubCopilotOAuthProvider.refreshToken(currentCredentials);
        scheduleModelRefresh(next);
        return next;
      },

      getApiKey(currentCredentials) {
        return githubCopilotOAuthProvider.getApiKey(currentCredentials);
      },

      modifyModels(models, currentCredentials) {
        const domain = getEnterpriseDomain(currentCredentials);
        const baseUrl = getGitHubCopilotBaseUrl(currentCredentials.access, domain);
        return populateCopilotModels(models, state.getPayload(), baseUrl);
      },
    },
  };

  const state = createCopilotState(providerConfig);

  // Model discovery is auxiliary to authentication. In particular, pi invokes
  // refreshToken while holding its cross-process auth lock, so awaiting a
  // separate `/models` request here would delay persistence of the new token
  // and could make a healthy refresh appear hung. Re-register once discovery
  // finishes so the live model registry receives the updated projection.
  async function refreshModels(
    accessToken: string,
    enterpriseDomain?: string,
    options?: { force?: boolean },
  ): Promise<void> {
    if (await state.refresh(accessToken, enterpriseDomain, options)) {
      pi.registerProvider("github-copilot", providerConfig);
    }
  }

  function scheduleModelRefresh(credentials: OAuthCredentials): void {
    void refreshModels(credentials.access, getEnterpriseDomain(credentials), { force: true }).catch(
      () => {
        // Model discovery is best-effort and must not affect authentication.
      },
    );
  }

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
