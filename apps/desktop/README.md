# AgentBridge Desktop

Electron + React local companion shell for AgentBridge.

## Development

```powershell
pnpm --filter @agentbridge/desktop dev
```

The Vite renderer runs in browser mode for quick UI development. The Electron main process and preload are type-checked and emitted during `pnpm --filter @agentbridge/desktop build`.

## Current Flow

- Mock browser source for development before native-host integration is complete.
- Codex target configuration by local repository path.
- Link manager for source/target/transform binding.
- Deterministic transform preview.
- Dry-run Codex deep-link delivery.

No cloud auth is required.
