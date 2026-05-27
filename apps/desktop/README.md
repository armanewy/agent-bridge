# AgentBridge Desktop

Electron + React desktop app for AgentBridge.

## Development

```powershell
pnpm dev:desktop
pnpm desktop:dev
```

The Vite renderer runs in browser mode for quick UI development. `pnpm desktop:dev` opens the Electron shell against the Vite renderer and shows a development-mode banner.

## Packaging

```powershell
pnpm desktop:package
```

This builds:

- the renderer and Electron main/preload files
- a bundled native host script
- the Windows UIA helper publish output
- an unpacked Windows app at `apps/desktop/release/win-unpacked/AgentBridge.exe`

`pnpm desktop:dist` creates the first-pass NSIS target. Code signing and auto-update are intentionally deferred.

## Current Flow

- Workbench accepts a mission in plain text.
- ChatGPT returns a structured plan that the user imports into Workbench.
- Workbench creates a TaskSpec, sends it to Codex, runs verification, and surfaces review evidence.
- Settings configures the repo/Codex target.
- Tasks shows task history, artifacts, verification, and follow-up drafts.
- Advanced contains current pipeline components and audit diagnostics.

No cloud auth is required.
