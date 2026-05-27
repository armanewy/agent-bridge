# AgentBridge Repo Audit

## Existing Repository State

The repository is currently empty except for Git metadata. There is no package manager configuration, application code, build tooling, or existing product structure to preserve.

## Recommended Monorepo Layout

Use a pnpm workspace with TypeScript-first packages and a Windows-native helper:

```text
apps/
  desktop/          Electron + React + TypeScript local companion app
  extension/        Chrome Manifest V3 extension
  native-host/      Node/TypeScript Chrome native messaging host
  win-uia-helper/   C#/.NET Windows UI Automation helper
packages/
  core/             Shared domain types, schemas, transforms, safety, redaction
  local-store/      Local-only persistence abstraction
docs/               Architecture, security, setup, test, and product docs
tests/              Cross-package smoke tests and manual harnesses
scripts/            Developer setup and packaging scripts
spikes/             Isolated explorations that should not affect MVP stability
```

## Recommended Package And App Names

- `@agentbridge/core`
- `@agentbridge/local-store`
- `@agentbridge/desktop`
- `@agentbridge/extension`
- `@agentbridge/native-host`
- `AgentBridge.WinUiaHelper`

## Recommended Build Tools

- `pnpm` workspaces for JavaScript/TypeScript dependency management.
- TypeScript project references or shared base config.
- `tsx` or `tsup` for Node package development builds.
- Vitest for TypeScript unit tests.
- Electron + Vite + React for the desktop companion.
- Chrome Manifest V3 with Vite or a small TypeScript build for extension assets.
- .NET 8 console project for Windows UI Automation helper.
- PowerShell scripts for Windows native-host registration and developer setup.

## Constraints Discovered

- Empty repo means the initial scaffold can be created directly.
- The workspace path contains a space: `C:\Users\aoztu\Documents\Agent Bridge`. Scripts must quote paths correctly.
- The MVP should stay local-first and Windows-first while keeping adapter interfaces portable.
- Browser capture must be explicit and user-triggered.
- Generic desktop delivery must prefer Windows UI Automation and treat clipboard/send-keys as explicit fallback paths.
- Codex should use documented `codex://threads/new?prompt=...&path=...` deep links for the MVP.

## Root-Level Files Later Waves Should Create Or Modify

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `.gitignore`
- `README.md`
- `docs/integration-notes.md`
- `scripts/*.ps1`
- `tests/**` for smoke coverage

## Risks And Unknowns

- Chrome native messaging registration requires the final installed extension ID, so development setup needs a placeholder and clear instructions.
- Windows UI Automation behavior varies across Electron, WebView, terminal, and custom controls.
- Codex deep links are the safest MVP target path, but richer programmatic control may require the Codex SDK or app-server after a spike.
- SQLite native dependencies may complicate Windows setup; a JSON-file store is acceptable for the MVP unless persistence needs exceed simple local records.
- UI delivery into arbitrary applications can be dangerous without strong target revalidation and approval UX.
