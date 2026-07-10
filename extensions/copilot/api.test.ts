/**
 * Coverage for bounded, best-effort Copilot model discovery.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchCopilotModels } from "./api.js";
import { loadCachedModels, saveCachedModels } from "./cache.js";

vi.mock("./cache.js", () => ({
  loadCachedModels: vi.fn(),
  saveCachedModels: vi.fn(),
}));

describe("fetchCopilotModels", () => {
  beforeEach(() => {
    vi.mocked(loadCachedModels).mockReset();
    vi.mocked(saveCachedModels).mockReset();
    vi.unstubAllGlobals();
  });

  it("bounds forced network requests with an abort signal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCopilotModels("token", undefined, { force: true })).resolves.toEqual({
      data: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.individual.githubcopilot.com/models",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
