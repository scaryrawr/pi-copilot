/**
 * Coverage for the curated Copilot catalog sources.
 *
 * The persisted overlay lives under the agent directory, which is redirected
 * to a real temporary directory; no module mocks are needed.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Set before the extension modules compute their on-disk paths.
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-copilot-catalog-"));

const { loadCuratedCopilotModels } = await import("./catalog.js");

const { MODELS_STORE } = await import("./constants.js");

describe("loadCuratedCopilotModels", () => {
  it("overlays persisted catalog models on top of the built-in catalog", async () => {
    writeFileSync(
      MODELS_STORE,
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
    expect(ids).not.toContain("garbage");
  });

  it("returns the built-in catalog when the store is missing or malformed", async () => {
    rmSync(MODELS_STORE, { force: true });
    const builtIns = await loadCuratedCopilotModels();
    expect(builtIns.length).toBeGreaterThan(0);

    writeFileSync(MODELS_STORE, "not json");
    const sameAsBuiltIns = await loadCuratedCopilotModels();
    expect(sameAsBuiltIns.map((model) => model.id)).toEqual(builtIns.map((model) => model.id));
  });
});
