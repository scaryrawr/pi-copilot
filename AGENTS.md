# AGENTS.md

Shared guidance for agents working in `pi-copilot`. Keep changes minimal, typed, and consistent with the conventions below.

## What this repo is

A single pi extension (`@earendil-works/pi-coding-agent`) that registers GitHub Copilot as a model provider. It wires GitHub's OAuth flow into pi, fetches the user's `/models` payload, and projects it into pi's `Model` / `ProviderModelConfig` shapes. There is no runtime server — the extension is consumed by pi via the `pi.extensions` field in `package.json`.

## Commands

Always run these from the repo root:

| Task       | Command                                                  |
| ---------- | -------------------------------------------------------- |
| Type-check | `npm run build` (uses `tsgo`, `noEmit`)                  |
| Format     | `npm run fmt` (write) / `npm run fmt:check` (verify)     |
| Lint       | `npm run lint` (oxlint, type-aware) / `npm run lint:fix` |
| Tests      | `npm test -- --run` (plain `npm test` starts watch mode) |
| Smoke test | `pi --list-models github-copilot`                        |

Before declaring work done, run `npm run fmt:check && npm run lint && npm run build`. Tests should pass if any exist that cover the touched area.

When upgrading tooling, `oxlint` declares an optional `oxlint-tsgolint` peer (currently `>=7.0.2001`, versioned independently of `oxlint` itself). Bump the two together and reinstall; a version outside that range fails `npm install` with `ERESOLVE` and breaks the type-aware `npm run lint`. Check the peer range in `node_modules/oxlint/package.json` instead of guessing from the oxlint version.

## Architecture

Entry point: `extensions/copilot.ts`. It composes everything in `extensions/copilot/*` into one `ProviderConfig` and calls `pi.registerProvider("github-copilot", ...)`.

Module boundaries (keep these crisp; do not cross-import sideways more than needed):

- `constants.ts` — headers, URLs, cache paths, compat flag bundles, `ZERO_COST`. Pure values, no logic.
- `types.ts` — TypeBox schemas + derived types for the `/models` payload, credentials, and cache entry. Owns the single `ModelResponseParser` (`Compile(Models)`).
- `cache.ts` — best-effort 24h on-disk cache of the `/models` response. All errors are swallowed.
- `compat.ts` — Copilot endpoint/domain helpers (proxy-token → API base URL, enterprise domain normalization). Keep this free of catalog/auth concerns; `catalog.ts` and `credentials.ts` own those.
- `catalog.ts` — reads pi's curated Copilot catalog: built-in models via `@earendil-works/pi-ai/providers/all` plus the dynamic overlay pi persists in `models-store.json` (overlay wins). Best-effort; failures yield fewer models.
- `credentials.ts` — reads `auth.json` from `getAgentDir()`, extracts the optional enterprise domain. Tolerates malformed input.
- `api.ts` — `fetchCopilotModels()`: cache-first fetch of `/models` with Copilot's required headers, bounded retries on HTTP 429, and caller-signal cancellation. Returns `undefined` on any failure.
- `inference.ts` — capability inference (api flavor, reasoning, vision, compat) plus `enabledCopilotModels(payload, policyFallback)`, which mirrors Copilot's own availability rules (tool-call support, picker enabled, policy not `disabled`, policy `enabled` fallback). Order of preference: explicit capability flags → endpoint list → id heuristics.
- `mapping.ts` — translates Copilot API entries to pi `Model` / `ProviderModelConfig`. The `/models` payload is authoritative for availability: Copilot models absent from the payload, disabled in the picker, disabled by policy, or missing tool-call support are dropped, while entries that are present still **preserve any pre-existing curated fields for the same model id** (supplied by the caller, normally `loadCuratedCopilotModels()`).
- `state.ts` — `createCopilotState(providerConfig)`: owns the mutable `/models` payload and reprojects it onto the live `ProviderConfig` during provider refresh and bootstrap.

Lifecycle: the extension inherits pi's built-in GitHub Copilot OAuth implementation. Bootstrap seeds the model list from cache; pi's `refreshModels` provider hook refreshes account-specific models after credential resolution; `session_start` remains a fallback refresh path. Keep discovery outside OAuth callbacks because pi refreshes credentials under a cross-process auth lock.

## Conventions

- **TypeScript:** strict mode with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, and `verbatimModuleSyntax`. When forwarding an optional field, use a conditional spread (`...(x !== undefined ? { x } : {})`) — assigning `undefined` is a type error. See `toCopilotModel` for the established pattern.
- **ESM:** all relative imports use the `.js` extension (NodeNext module resolution); type-only imports use `import type` or `import { type X }` because of `verbatimModuleSyntax`.
- **Runtime validation:** parse external payloads through the pre-compiled `ModelResponseParser`. Do not hand-roll shape checks for Copilot's API.
- **Failure mode:** auth, network, and cache paths should swallow errors and return `undefined` rather than throw. Extension bootstrap must never break pi startup.
- **Curated-field preservation:** when remapping Copilot entries to pi models, start from `enabledCopilotModels(payload)` and look up an existing model only for those returned ids. Prefer the existing model's `api`, `name`, `reasoning`, `input`, `cost`, `promptCache`, `headers`, `compat`, and `thinkingLevelMap`; refresh only `contextWindow` / `maxTokens` from the latest payload (with fallbacks via `positiveNumber`). Never carry over Copilot models that are missing from the payload just to preserve curated fields.
- **Copilot headers:** `COPILOT_HEADERS` mirrors the official VS Code extension and `COPILOT_API_VERSION` matches what pi's built-in Copilot client sends. Do not change the User-Agent / Editor-Version / Copilot-Integration-Id / X-GitHub-Api-Version strings without a deliberate reason — Copilot gates on these.
- **Comments:** every module has a top-of-file docblock describing its role. Match that style for new modules; keep inline comments focused on "why", not "what".

## Adding a new capability

1. If Copilot exposes a new capability flag, extend `SupportsSchema` (or the `policy` schema) in `types.ts` first so the parser tolerates it.
2. Add inference helpers in `inference.ts` (prefer explicit flags over heuristics).
3. Wire the result through `toCopilotModel` in `mapping.ts`, remembering to preserve existing values when present.
4. If the capability requires new compat flags, add them to `constants.ts` and pick them up in `inferCompat`.

Mirroring upstream pi: Copilot authentication, login, and model-policy enabling live in pi's built-in `github-copilot` provider (`packages/ai`). When upstream changes how it calls `/models` (headers, payload fields, availability rules), update the matching constant/schema/helper here in the same change — this repo duplicates only the request and projection, never the OAuth flow.

## Safety / review notes

- `auth.json`, `copilot-models.json`, and `models-store.json` live under `getAgentDir()`. Never log their contents.
- The extension fetches over the network on every login/refresh. Don't add additional network calls to the bootstrap path without caching.
- Don't introduce a hard dependency on enterprise URLs — they're optional and may be missing.
