# AgentBridge

AgentBridge is a local-first developer agent-routing MVP. It lets a user explicitly bind a browser tab/source to a Windows desktop app target, capture selected/current source content, transform it into a structured handoff, preview and approve it, then deliver it to Codex or a generic Windows desktop app.

## MVP Principles

- Capture is user-triggered.
- Browser capture uses browser-native extension APIs.
- Windows desktop targeting uses Windows UI Automation before any fallback.
- Codex delivery uses documented `codex://threads/new?prompt=...&path=...` deep links first.
- Data is local by default.
- Clipboard fallback is explicit and approval-gated.

## Workspace Map

```text
apps/desktop        Electron + React companion app shell
apps/extension      Chrome Manifest V3 extension
apps/native-host    Chrome native messaging host
apps/win-uia-helper C#/.NET Windows UI Automation helper
packages/core       Shared models, schemas, adapters, redaction helpers
packages/local-store Local JSON-file persistence abstraction
docs                Architecture, setup, and integration docs
```

## Scripts

```powershell
npx -y pnpm@9.15.4 install
npx -y pnpm@9.15.4 build
npx -y pnpm@9.15.4 test
npx -y pnpm@9.15.4 dev:extension
npx -y pnpm@9.15.4 dev:native-host
dotnet run --project apps/win-uia-helper/AgentBridge.WinUiaHelper.csproj
```

`pnpm` is the intended package manager. If it is not installed globally, use `npx -y pnpm@9.15.4 ...` as shown above.

## Current Status

Wave 2 creates the scaffold, shared core models, JSON local store, extension skeleton, native host skeleton, and Windows UIA helper source. The desktop app is a placeholder package until Wave 3.
