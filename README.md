# pi-copilot

An extension for `pi` that integrates GitHub Copilot as a model provider.

This extension overrides Pi's built-in Copilot support and is a vibe fork of [pi's `github-copilot.ts`](https://github.com/earendil-works/pi/blob/main/packages/ai/src/utils/oauth/github-copilot.ts). It wires GitHub's OAuth flow into `pi`, fetches the available Copilot models, and projects them into `pi`'s model format. It handles authentication, token refreshing, and local caching to ensure a seamless experience.

## Getting Started

This is a `pi` extension. To install it, run:

```bash
pi install git:github.com/scaryrawr/pi-copilot
```

### Development

If you are a developer working on this extension, you can run the following commands:

| Task       | Command         |
| ---------- | --------------- |
| Type-check | `npm run build` |
| Format     | `npm run fmt`   |
| Lint       | `npm run lint`  |
| Test       | `npm test`      |

## Architecture

The extension is composed of several specialized modules:

- `api.ts`: Fetches and parses the Copilot models payload.
- `cache.ts`: Manages the on-disk cache of the model list.
- `credentials.ts`: Handles storage and retrieval of authentication credentials.
- `inference.ts`: Infers model capabilities from the API response.
- `mapping.ts`: Translates Copilot API entries into `pi` compatible models, preserving curated fields.
- `state.ts`: Manages the live state and re-projection of models.

## Contributing

Follow the guidelines in `AGENTS.md` for maintaining consistency and type safety.
