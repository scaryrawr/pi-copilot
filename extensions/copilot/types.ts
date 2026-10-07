/**
 * TypeBox schemas describing Copilot's `/models` payload, plus the credential
 * and cache types used throughout the extension.
 */

import { Type } from "typebox";
import { Compile } from "typebox/compile";

// ---------------------------------------------------------------------------
// `/models` payload
// ---------------------------------------------------------------------------

/** Capability flags Copilot publishes for each model. */
const SupportsSchema = Type.Object({
  vision: Type.Optional(Type.Boolean()),
  tool_calls: Type.Optional(Type.Boolean()),
  reasoning_effort: Type.Optional(Type.Array(Type.String())),
  max_thinking_budget: Type.Optional(Type.Number()),
  min_thinking_budget: Type.Optional(Type.Number()),
  /** Anthropic adaptive thinking; sent alongside or instead of `reasoning_effort`. */
  adaptive_thinking: Type.Optional(Type.Boolean()),
});

/** Image input limits Copilot reports under `capabilities.limits.vision`. */
const VisionLimitsSchema = Type.Object({
  max_prompt_image_size: Type.Optional(Type.Number()),
  max_prompt_images: Type.Optional(Type.Number()),
  supported_media_types: Type.Optional(Type.Array(Type.String())),
});

/** Organization policy attached to a model. `disabled` hides it from the account. */
const PolicySchema = Type.Object({
  state: Type.Optional(Type.String()),
});

/**
 * Per-token billing. Copilot switched to usage-based billing and publishes
 * prices in cents per million tokens; values are `0` on plans that bill by
 * premium request instead.
 */
const TokenPriceSchema = Type.Object({
  input_price: Type.Optional(Type.Number()),
  output_price: Type.Optional(Type.Number()),
  cache_price: Type.Optional(Type.Number()),
  cache_write_price: Type.Optional(Type.Number()),
});

const BillingSchema = Type.Object({
  token_prices: Type.Optional(
    Type.Object({
      default: Type.Optional(TokenPriceSchema),
    }),
  ),
});

/** A single entry from Copilot's `/models` response. */
const ModelSchema = Type.Object({
  id: Type.String(),
  name: Type.Optional(Type.String()),
  model_picker_enabled: Type.Optional(Type.Boolean()),
  policy: Type.Optional(PolicySchema),
  billing: Type.Optional(BillingSchema),
  supported_endpoints: Type.Optional(Type.Array(Type.String())),
  capabilities: Type.Optional(
    Type.Object({
      limits: Type.Optional(
        Type.Object({
          max_context_window_tokens: Type.Optional(Type.Number()),
          max_output_tokens: Type.Optional(Type.Number()),
          max_prompt_tokens: Type.Optional(Type.Number()),
          max_non_streaming_output_tokens: Type.Optional(Type.Number()),
          vision: Type.Optional(VisionLimitsSchema),
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
