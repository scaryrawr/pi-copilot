/**
 * TypeBox schemas describing Copilot's `/models` payload, plus the credential
 * and cache types used throughout the extension.
 */

import { Type, type OAuthCredentials } from "@earendil-works/pi-ai";
import { Compile } from "typebox/compile";

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

/** Copilot credentials augmented with an optional enterprise host. */
export type CopilotCredentials = OAuthCredentials & {
  enterpriseUrl?: string;
};

/** Loosely-typed shape we tolerate when reading `auth.json` from disk. */
export type StoredCopilotCredentials = Partial<CopilotCredentials> & {
  type?: string;
};

/** Top-level shape of `auth.json` that we care about. */
export type Tokens = {
  "github-copilot"?: StoredCopilotCredentials;
};

// ---------------------------------------------------------------------------
// `/models` payload
// ---------------------------------------------------------------------------

/** Capability flags Copilot publishes for each model. */
const SupportsSchema = Type.Object({
  vision: Type.Optional(Type.Boolean()),
  reasoning_effort: Type.Optional(Type.Array(Type.String())),
  max_thinking_budget: Type.Optional(Type.Number()),
  min_thinking_budget: Type.Optional(Type.Number()),
});

/** A single entry from Copilot's `/models` response. */
const ModelSchema = Type.Object({
  id: Type.String(),
  name: Type.Optional(Type.String()),
  model_picker_enabled: Type.Optional(Type.Boolean()),
  supported_endpoints: Type.Optional(Type.Array(Type.String())),
  capabilities: Type.Optional(
    Type.Object({
      limits: Type.Optional(
        Type.Object({
          max_context_window_tokens: Type.Optional(Type.Number()),
          max_output_tokens: Type.Optional(Type.Number()),
          max_prompt_tokens: Type.Optional(Type.Number()),
        }),
      ),
      supports: Type.Optional(SupportsSchema),
    }),
  ),
});

/** Envelope returned by Copilot's `/models` endpoint. */
export const Models = Type.Object({
  data: Type.Array(ModelSchema),
});

export type ModelResponse = Type.Static<typeof Models>;
export type CopilotApiModel = ModelResponse["data"][number];

/** Pre-compiled validator for the `/models` payload. */
export const ModelResponseParser = Compile(Models);

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/** Cached payload plus the time it was fetched. */
export const ModelsCached = Type.Object({
  content: Models,
  cachedAt: Type.String(),
});

export type CachedModels = Type.Static<typeof ModelsCached>;
