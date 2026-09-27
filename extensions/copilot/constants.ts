/**
 * Constants shared across the GitHub Copilot extension.
 */

import { join } from "node:path";

import { getAgentDir } from "@earendil-works/pi-coding-agent";

/** How long a cached `/models` response is considered fresh. */
export const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Maximum time a single `/models` request may spend waiting on Copilot. */
export const MODELS_REQUEST_TIMEOUT_MS = 5_000;

/** How many times a rate-limited `/models` request is retried. */
export const MODELS_MAX_RETRIES = 2;

/** Total time all `/models` attempts plus backoff may consume. */
export const MODELS_RETRY_BUDGET_MS = 5_000;

/** On-disk cache of the Copilot `/models` response. */
export const MODELS_CACHE = join(getAgentDir(), "copilot-models.json");

/** pi's shared auth store; we read `github-copilot` credentials from here. */
export const AUTH_FILE = join(getAgentDir(), "auth.json");

/** pi's persisted dynamic model catalog; overlays the built-in catalog. */
export const MODELS_STORE = join(getAgentDir(), "models-store.json");

/** Base URL for individual (non-enterprise) Copilot accounts; also the fallback. */
export const INDIVIDUAL_BASE_URL = "https://api.individual.githubcopilot.com";

/** Copilot gates parts of its API on this version header. */
export const COPILOT_API_VERSION = "2026-06-01";

/**
 * Headers Copilot expects on every request. Mirroring the official VS Code
 * extension keeps us on the supported path.
 */
export const COPILOT_HEADERS = {
  "User-Agent": "GitHubCopilotChat/0.35.0",
  "Editor-Version": "vscode/1.107.0",
  "Editor-Plugin-Version": "copilot-chat/0.35.0",
  "Copilot-Integration-Id": "vscode-chat",
} as const;

/** Copilot does not bill us directly, so all models report zero cost. */
export const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** Compat flags for models accessed through `/chat/completions`. */
export const OPENAI_COMPLETIONS_COMPAT = {
  supportsStore: false,
  supportsDeveloperRole: false,
  supportsReasoningEffort: false,
} as const;

/** Compat flags for models accessed through `/v1/messages`. */
export const ANTHROPIC_COMPAT = {
  supportsEagerToolInputStreaming: false,
} as const;
