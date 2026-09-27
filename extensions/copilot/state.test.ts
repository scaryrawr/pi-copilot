/**
 * Coverage for resilient updates to the mutable Copilot model state.
 *
 * Network access is stubbed at the global `fetch` seam and the catalog/cache
 * run against a real temporary agent directory instead of module mocks.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { OAuthCredentials } from "@earendil-works/pi-ai";
import type { ProviderConfig } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ModelResponse } from "./types.js";

// Set before the extension modules compute their on-disk paths.
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-copilot-state-"));

const { createCopilotState } = await import("./state.js");

const credentials: OAuthCredentials = {
  refresh: "github-token",
  access: "copilot-token",
  expires: Date.now() + 60_000,
};

const initialPayload = {
  data: [{ id: "initial", model_picker_enabled: true }],
} satisfies ModelResponse;

const refreshedPayload = {
  data: [{ id: "refreshed", model_picker_enabled: true }],
} satisfies ModelResponse;

describe("createCopilotState", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the last usable payload when refreshing the model list fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const providerConfig: ProviderConfig = {};
    const state = createCopilotState(providerConfig);
    state.setPayload(initialPayload);

    await expect(state.refresh(credentials.access, undefined, { force: true })).resolves.toBe(
      false,
    );

    expect(state.getPayload()).toBe(initialPayload);
    expect(providerConfig.models?.map((model) => model.id)).toEqual(["initial"]);
  });

  it("reprojects and reports a successful model refresh", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(refreshedPayload)));
    vi.stubGlobal("fetch", fetchMock);

    const providerConfig: ProviderConfig = {};
    const state = createCopilotState(providerConfig);
    state.setPayload(initialPayload);

    await expect(state.refresh(credentials.access, undefined, { force: true })).resolves.toBe(true);

    expect(state.getPayload()).toEqual(refreshedPayload);
    expect(providerConfig.models?.map((model) => model.id)).toEqual(["refreshed"]);
  });
});
