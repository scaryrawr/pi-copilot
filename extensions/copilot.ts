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
  ): Promise<void> {
    if (await state.refresh(accessToken, enterpriseDomain, options)) {
      pi.registerProvider("github-copilot", providerConfig);
    }
  }

  providerConfig.refreshModels = async (context) => {
    const credentials = context.credential;

    if (credentials?.type !== "oauth") return providerConfig.models ?? [];

    if (context.allowNetwork) {
      await refreshModels(credentials.access, getEnterpriseDomain(credentials), {
        signal: context.signal,
        force: context.force === true,
      });
    } else {
      await state.reproject(credentials.access, getEnterpriseDomain(credentials));
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
    await refreshModels(accessToken, enterpriseDomain, signal ? { signal } : undefined);
  });

  pi.registerProvider("github-copilot", providerConfig);
}
