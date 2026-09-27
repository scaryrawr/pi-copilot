/**
 * Coverage for the curated Copilot catalog sources.
 */

import { readFile } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadCuratedCopilotModels } from "./catalog.js";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(readFile).mockReset();
});

describe("loadCuratedCopilotModels", () => {
  it("overlays persisted catalog models on top of the built-in catalog", async () => {
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({
        "github-copilot": {
          models: [
            { id: "claude-opus-5.5", name: "Claude Opus 5.5", api: "anthropic-messages" },
            { id: "claude-sonnet-5", name: "Overridden", api: "anthropic-messages" },
            "garbage",
          ],
        },
      }),
    );

    const models = await loadCuratedCopilotModels();
    const ids = models.map((model) => model.id);

    expect(ids).toContain("claude-opus-5.5");
    expect(models.find((model) => model.id === "claude-sonnet-5")?.name).toBe("Overridden");
    expect(models.every((model) => model.provider === "github-copilot")).toBe(true);
  });

  it("returns the built-in catalog when the store is missing or malformed", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
    const builtIns = await loadCuratedCopilotModels();
    expect(builtIns.length).toBeGreaterThan(0);

    vi.mocked(readFile).mockResolvedValue("not json");
    const sameAsBuiltIns = await loadCuratedCopilotModels();
    expect(sameAsBuiltIns.map((model) => model.id)).toEqual(builtIns.map((model) => model.id));
  });
});
