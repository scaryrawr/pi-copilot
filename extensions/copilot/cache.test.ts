/**
 * Coverage for validation and expiration of the model cache.
 */

import { readFile } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadCachedModels } from "./cache.js";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

describe("loadCachedModels", () => {
  beforeEach(() => {
    vi.mocked(readFile).mockReset();
  });

  it("rejects expired cache entries", async () => {
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({
        content: { data: [{ id: "cached-model" }] },
        cachedAt: "2000-01-01T00:00:00.000Z",
      }),
    );

    await expect(loadCachedModels()).resolves.toBeUndefined();
  });

  it("rejects cache entries with an invalid timestamp", async () => {
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ content: { data: [] }, cachedAt: "not-a-date" }),
    );

    await expect(loadCachedModels()).resolves.toBeUndefined();
  });
});
