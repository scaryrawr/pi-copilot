/**
 * GitHub Copilot provider extension for pi.
 *
 * Extends pi's built-in GitHub Copilot provider with account-specific model
 * discovery, refreshing through pi's provider lifecycle and the on-disk cache
 * at startup. The heavy lifting lives in `./copilot/*`; this file just composes
 * those modules into a `ProviderConfig` and registers it.
 */

import type { ProviderConfig, SessionStartEvent } from "@earendil-works/pi-coding-agent";

import { loadCachedModels } from "./copilot/cache.js";
import { getEnterpriseDomain, loadStoredCopilotCredentials } from "./copilot/credentials.js";
import { createCopilotState } from "./copilot/state.js";

/** The subset of pi's extension context used by the `session_start` handler. */
export interface CopilotSessionContext {
  modelRegistry: { getApiKeyForProvider(provider: string): Promise<string | undefined> };
  signal: AbortSignal | undefined;
}

/**
 * The slice of pi's extension API this extension actually consumes.
 * Declaring only what we use keeps the surface small and testable; pi's
 * full `ExtensionAPI` remains structurally assignable to it.
 */
export interface CopilotExtensionApi {
  on(
    event: "session_start",
    handler: (event: SessionStartEvent, ctx: CopilotSessionContext) => Promise<void>,
  ): () => void;
  registerProvider(name: string, config: ProviderConfig): void;
}

export default async function (pi: CopilotExtensionApi) {
  const providerConfig: ProviderConfig = {
    name: "GitHub Copilot",
  };

  const state = createCopilotState(providerConfig);

  async function refreshModels(
    accessToken: string,
    enterpriseDomain?: string,
    options?: { force?: boolean; signal?: AbortSignal },
  ): Promise<boolean> {
    return state.refresh(accessToken, enterpriseDomain, options);
  }

  // pi publishes whatever this hook returns, so it must never yield an empty
  // list: that would delete every Copilot model until the next refresh.
  // Without OAuth credentials we keep the last known (curated) projection.
  providerConfig.refreshModels = async (context) => {
    const credentials = context.credential;

    if (credentials?.type !== "oauth") {
      await state.reproject();

      return providerConfig.models ?? [];
    }

    const enterpriseDomain = getEnterpriseDomain(credentials);

    if (context.allowNetwork) {
      await refreshModels(credentials.access, enterpriseDomain, {
        signal: context.signal,
        force: context.force === true,
      });
    } else {
      await state.reproject(credentials.access, enterpriseDomain);
    }

    return providerConfig.models ?? [];
  };

  // Surface a warm cache before pi starts a session. It is refreshed below
  // using pi's OAuth-aware API-key resolution path.
  state.setPayload((await loadCachedModels())?.content);
  await state.reproject();

  pi.on("session_start", async (_event, ctx) => {
    const accessToken = await ctx.modelRegistry.getApiKeyForProvider("github-copilot");

    if (!accessToken) return;

    const storedCredentials = await loadStoredCopilotCredentials();
    const enterpriseDomain = storedCredentials ? getEnterpriseDomain(storedCredentials) : undefined;
    const signal = ctx.signal;

    // Outside pi's refresh lifecycle, so re-registering here is the only way to
    // publish a payload discovered after startup.
    if (await refreshModels(accessToken, enterpriseDomain, signal ? { signal } : undefined)) {
      pi.registerProvider("github-copilot", providerConfig);
    }
  });

  pi.registerProvider("github-copilot", providerConfig);
}
