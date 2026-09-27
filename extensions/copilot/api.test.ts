/**
 * Coverage for bounded, best-effort Copilot model discovery.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchCopilotModels } from "./api.js";
import { loadCachedModels, saveCachedModels } from "./cache.js";
import { COPILOT_API_VERSION } from "./constants.js";

vi.mock("./cache.js", () => ({
  loadCachedModels: vi.fn(),
  saveCachedModels: vi.fn(),
}));

function okResponse() {
  return new Response(JSON.stringify({ data: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchCopilotModels", () => {
  beforeEach(() => {
    vi.mocked(loadCachedModels).mockReset();
    vi.mocked(saveCachedModels).mockReset();
    vi.unstubAllGlobals();
  });

  it("sends Copilot's expected headers and aborts on a bounded signal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCopilotModels("token", undefined, { force: true })).resolves.toEqual({
      data: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.individual.githubcopilot.com/models",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          Accept: "application/json",
          Authorization: "Bearer token",
          "X-GitHub-Api-Version": COPILOT_API_VERSION,
        }),
      }),
    );
  });

  it("retries rate-limited responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCopilotModels("token", undefined, { force: true })).resolves.toEqual({
      data: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry budget", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCopilotModels("token", undefined, { force: true })).resolves.toBeUndefined();
  });

  it("stops fetching when the caller aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchCopilotModels("token", undefined, { force: true, signal: controller.signal }),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
