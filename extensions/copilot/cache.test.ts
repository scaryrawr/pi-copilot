/**
 * Coverage for validation and expiration of the model cache.
 *
 * Tests run against a real temporary agent directory; the cache module's
 * file paths derive from `PI_CODING_AGENT_DIR`, so no module mocks are needed.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Set before the extension modules compute their on-disk paths.
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-copilot-cache-"));

const { loadCachedModels } = await import("./cache.js");

const { MODELS_CACHE } = await import("./constants.js");

describe("loadCachedModels", () => {
  it("rejects expired cache entries", async () => {
    writeFileSync(
      MODELS_CACHE,
      JSON.stringify({
        content: { data: [{ id: "cached-model" }] },
        cachedAt: "2000-01-01T00:00:00.000Z",
      }),
    );

    await expect(loadCachedModels()).resolves.toBeUndefined();
  });

  it("rejects cache entries with an invalid timestamp", async () => {
    writeFileSync(MODELS_CACHE, JSON.stringify({ content: { data: [] }, cachedAt: "not-a-date" }));

    await expect(loadCachedModels()).resolves.toBeUndefined();
  });

  it("rejects malformed cache files", async () => {
    writeFileSync(MODELS_CACHE, "not json");

    await expect(loadCachedModels()).resolves.toBeUndefined();
  });

  it("returns a fresh, valid cache entry", async () => {
    writeFileSync(
      MODELS_CACHE,
      JSON.stringify({
        content: { data: [{ id: "fresh-model" }] },
        cachedAt: new Date().toISOString(),
      }),
    );

    const cached = await loadCachedModels();

    expect(cached?.content.data.map((model) => model.id)).toEqual(["fresh-model"]);
  });
});
