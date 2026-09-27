/**
 * Coverage for the provider's authentication lifecycle wiring.
 *
 * The extension's `pi` parameter is narrowed to what it actually consumes, so
 * the stub below implements that interface directly; network access is stubbed
 * at the global `fetch` seam and all file access runs against a real
 * temporary agent directory instead of module mocks.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { OAuthCredential, RefreshModelsContext } from "@earendil-works/pi-ai";
import type { ProviderConfig, SessionStartEvent } from "@earendil-works/pi-coding-agent";
import { beforeEach, expect, it, vi } from "vitest";

import type { CopilotExtensionApi, CopilotSessionContext } from "./copilot.js";

// Set before the extension modules compute their on-disk paths.
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-copilot-entry-"));

const { default: copilotExtension } = await import("./copilot.js");

const { MODELS_CACHE } = await import("./copilot/constants.js");

const refreshedCredentials = {
  type: "oauth",
  refresh: "github-token",
  access: "new-copilot-token",
  expires: Date.now() + 60_000,
} satisfies OAuthCredential;

interface PiStub {
  readonly registrations: ProviderConfig[];
  readonly pi: CopilotExtensionApi;
  readonly sessionStartHandler: (ctx: CopilotSessionContext) => Promise<void>;
}

function createPiStub(): PiStub {
  const registrations: ProviderConfig[] = [];

  const sessionStartHandlers: Array<
    (event: SessionStartEvent, ctx: CopilotSessionContext) => Promise<void>
  > = [];

  const pi: CopilotExtensionApi = {
    on(_event, handler) {
      sessionStartHandlers.push(handler);

      return () => {};
    },
    registerProvider(_name, config) {
      registrations.push(config);
    },
  };

  const sessionStartHandler = async (ctx: CopilotSessionContext): Promise<void> => {
    const handler = sessionStartHandlers[0];

    if (handler === undefined) throw new Error("no session_start handler registered");

    await handler({ type: "session_start", reason: "startup" }, ctx);
  };

  return { registrations, pi, sessionStartHandler };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  // Each test starts from an empty on-disk cache.
  rmSync(MODELS_CACHE, { force: true });
});

it("refreshes models through pi's provider refresh lifecycle", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] })));
  vi.stubGlobal("fetch", fetchMock);

  const { registrations, pi } = createPiStub();
  const signal = new AbortController().signal;

  await copilotExtension(pi);

  await registrations[0]?.refreshModels?.({
    credential: refreshedCredentials,
    publish: async () => true,
    allowNetwork: true,
    force: true,
    signal,
  } satisfies RefreshModelsContext);

  expect(fetchMock).toHaveBeenCalledWith(
    "https://api.individual.githubcopilot.com/models",
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer new-copilot-token" }),
    }),
  );
});

it("discovers models with the API key resolved by pi's auth storage", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ id: "discovered-model", model_picker_enabled: true }] }),
      ),
    );

  vi.stubGlobal("fetch", fetchMock);

  const { pi, registrations, sessionStartHandler } = createPiStub();

  await copilotExtension(pi);

  const ctx: CopilotSessionContext = {
    modelRegistry: { getApiKeyForProvider: async () => "refreshed-copilot-token" },
    signal: undefined,
  };

  await sessionStartHandler(ctx);

  expect(fetchMock).toHaveBeenCalledWith(
    "https://api.individual.githubcopilot.com/models",
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer refreshed-copilot-token" }),
    }),
  );
  expect(registrations).toHaveLength(2);
  expect(registrations[1]?.models?.map((model) => model.id)).toEqual(["discovered-model"]);
});

it("serves a warm cache from disk before pi starts a session", async () => {
  writeFileSync(
    MODELS_CACHE,
    JSON.stringify({
      content: { data: [{ id: "cached-model", model_picker_enabled: true }] },
      cachedAt: new Date().toISOString(),
    }),
  );

  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const { pi, registrations, sessionStartHandler } = createPiStub();

  await copilotExtension(pi);

  const ctx: CopilotSessionContext = {
    modelRegistry: { getApiKeyForProvider: async () => "refreshed-copilot-token" },
    signal: undefined,
  };

  await sessionStartHandler(ctx);

  expect(fetchMock).not.toHaveBeenCalled();
  expect(registrations.at(-1)?.models?.map((model) => model.id)).toContain("cached-model");
});
