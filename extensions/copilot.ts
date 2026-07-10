/**
 * GitHub Copilot provider extension for pi.
 *
 * Wires GitHub's OAuth flow into pi, then refreshes the user's available
 * Copilot model list on login, token refresh, and from the on-disk cache at
 * startup. The heavy lifting lives in `./copilot/*`; this file just composes
 * those modules into a `ProviderConfig` and registers it.
 */

import { githubCopilotOAuthProvider, getGitHubCopilotBaseUrl } from "@earendil-works/pi-ai/oauth";
import { type ExtensionAPI, type ProviderConfig } from "@earendil-works/pi-coding-agent";

import { loadCachedModels } from "./copilot/cache.js";
import { DEFAULT_BASE_URL } from "./copilot/constants.js";
import { getEnterpriseDomain, loadStoredCopilotCredentials } from "./copilot/credentials.js";
import { populateCopilotModels, toProviderModelConfigs } from "./copilot/mapping.js";
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
  function scheduleModelRefresh(credentials: Parameters<typeof state.refresh>[0]): void {
    void state
      .refresh(credentials, { force: true })
      .then((updated) => {
        if (updated) pi.registerProvider("github-copilot", providerConfig);
      })
      .catch(() => {
        // Model discovery is best-effort and must not affect authentication.
      });
  }

  // Surface a warm cache even before credentials are available. Fetching a
  // fresh cache still requires credentials, so login / refresh remain the
  // paths that build or update it.
  state.setPayload((await loadCachedModels())?.content);
  state.reproject();

  // Bootstrap from any previously-stored credentials so the provider has a
  // model list available before the user re-authenticates.
  const credentials = await loadStoredCopilotCredentials();
  if (credentials) {
    await state.refresh(credentials);
  }

  // If we have a payload but no credentials produced a usable baseUrl (e.g.
  // the access token was empty), fall back to the default Copilot host so we
  // still surface the model list.
  const payload = state.getPayload();
  if (payload && !providerConfig.models?.length) {
    providerConfig.baseUrl = DEFAULT_BASE_URL;
    providerConfig.models = toProviderModelConfigs(payload, DEFAULT_BASE_URL);
  }

  pi.registerProvider("github-copilot", providerConfig);
}
