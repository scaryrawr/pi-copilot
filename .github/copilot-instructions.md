# Copilot Instructions

See [`AGENTS.md`](../AGENTS.md) for shared architecture, commands, and conventions. This file only adds Copilot/VS Code specifics.

## Working in this repo

- This project is itself a GitHub Copilot provider for pi. When editing it, you are not editing your own Copilot configuration — you are editing an extension that pi loads to register `github-copilot` as a model provider.
- Prefer small, focused diffs that stay within the module boundaries described in `AGENTS.md` (`api`, `cache`, `credentials`, `inference`, `mapping`, `state`, `types`, `constants`).
- When suggesting completions in `extensions/copilot/*`, respect `exactOptionalPropertyTypes`: never assign `undefined` to an optional property; use the conditional-spread pattern already established in `mapping.ts`.
- Relative imports must end in `.js` (NodeNext). Type-only imports must use `import type` or `import { type X }` because `verbatimModuleSyntax` is on.

## Validation Copilot should suggest

After non-trivial edits, suggest running:

```
npm run fmt:check && npm run lint && npm run build
```

For changes scoped to one module, a narrower check is `npm run lint -- extensions/copilot/<file>.ts`.
