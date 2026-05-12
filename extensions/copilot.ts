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

import { fetchCopilotModels } from "./copilot/api.js";
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
        await state.refresh(next, { force: true });
        return next;
      },

      async refreshToken(currentCredentials) {
        const next = await githubCopilotOAuthProvider.refreshToken(currentCredentials);
        await state.refresh(next, { force: true });
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

  // Bootstrap from any previously-stored credentials so the provider has a
  // model list available before the user re-authenticates.
  const credentials = await loadStoredCopilotCredentials();
  if (credentials) {
    state.setPayload(
      await fetchCopilotModels(credentials.access, getEnterpriseDomain(credentials)),
    );
    state.reproject(credentials);
  }

  // If we have a payload but no credentials produced a usable baseUrl (e.g.
  // the access token was empty), fall back to the default Copilot host so we
  // still surface the model list.
  const payload = state.getPayload();
  if (payload && providerConfig.models?.length === 0) {
    providerConfig.baseUrl = DEFAULT_BASE_URL;
    providerConfig.models = toProviderModelConfigs(payload, DEFAULT_BASE_URL);
  }

  pi.registerProvider("github-copilot", providerConfig);
}
