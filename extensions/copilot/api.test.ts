/**
 * Coverage for bounded, best-effort Copilot model discovery.
 *
 * The cache runs against a real temporary agent directory and network access
 * is stubbed at the global `fetch` seam instead of mocking sibling modules.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

// Set before the extension modules compute their on-disk paths.
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-copilot-api-"));

const { fetchCopilotModels } = await import("./api.js");

const { COPILOT_API_VERSION } = await import("./constants.js");

function okResponse() {
  return new Response(JSON.stringify({ data: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchCopilotModels", () => {
  beforeEach(() => {
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

  it("persists a successful payload to the on-disk cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCopilotModels("token", undefined, { force: true })).resolves.toEqual({
      data: [],
    });

    // The cache written above is what the next non-forced call serves,
    // without touching the network again.
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(fetchCopilotModels("token")).resolves.toEqual({ data: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
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
    expect(fetchMock).toHaveBeenCalled();
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
