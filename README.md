# AgentBridge

AgentBridge is a local-first desktop app for turning AI guidance into durable, repo-aware work for coding agents.

The narrow product loop is now:

```text
OpenAI Planner
-> TaskSpec
-> Codex executor
-> verification artifacts
-> Planner review
-> optional Codex follow-up
```

The default path does not require a browser extension, external ChatGPT tab, clipboard capture, or ChatGPT Desktop probing. The built-in Planner creates scoped coding direction inside AgentBridge; Codex executes through deep links or Codex App Server.

`http://127.0.0.1:5173` is development-only. The product surface is the packaged desktop app.

## Default Workbench Flow

1. Launch AgentBridge.
2. Choose the local repo Codex should work in.
3. Describe the desired outcome once.
4. Start a Manual, Supervised, or Autonomous mission.
5. AgentBridge asks the OpenAI Planner, creates a TaskSpec, sends it to Codex, runs configured verification, asks Planner to review, and drafts/sends follow-up work when policy allows it.

The detailed manual controls are still available in the expandable Workbench details panel:

```text
Ask Planner -> Generate TaskSpec -> Send to Codex -> Verify -> Planner Review -> Follow-up
```

Optional adapters remain under Advanced for importing external ChatGPT/browser/Desktop context, but they are not the first-run requirement.

## What AgentBridge Stores

AgentBridge stores local work records so the task can be resumed and audited:

- `Mission`: the durable user task.
- `TaskSpec`: the structured agent-ready task.
- `HandoffCard`: one dispatch to Codex or another target.
- `RepoContextPack`: repo path, branch/status, changed files, and verification commands.
- `Artifact`: captured text, generated prompt, delivery result, git diff, test output, follow-up prompt, and related evidence.
- `VerificationResult`: pass/fail/needs-review status and command results.

Data is local by default under the Electron user-data directory unless `AGENTBRIDGE_STORE_DIR` is set. Non-Electron fallbacks are `%LOCALAPPDATA%\AgentBridge` on Windows and `~/Library/Application Support/AgentBridge` on macOS.

## Codex Delivery Modes

AgentBridge is explicit about what happened:

- New Codex thread: opens `codex://threads/new?prompt=...&path=...`.
- Existing Codex thread, open-only fallback: opens `codex://threads/<thread-id>` and warns that the prompt was not injected.
- Existing Codex thread via App Server: uses Codex App Server `thread/resume` and `turn/start` when `CODEX_APP_SERVER_URL` is configured.

The Task Card Preview shows the selected delivery mode before sending.

## Optional Browser Extension

The Chrome extension is an optional Advanced adapter for users who want to bind an existing external browser tab. It is not required for the default Workbench.

For local development:

```powershell
pnpm --filter @agentbridge/extension build
```

Then load this folder as an unpacked extension in Chrome:

```text
apps/extension
```

In AgentBridge Settings, the local extension setup shows:

- Open extension folder
- Open Chrome extensions
- Chrome extension ID input
- Save ID and connect

The extension uses `activeTab`, `scripting`, and `nativeMessaging`; it does not request broad host permissions or run background page scraping.

## Workspace Map

```text
apps/desktop         Electron + React desktop app, local services, tray/shortcut, Codex delivery
apps/extension       Optional Chrome Manifest V3 adapter for external browser tabs
apps/native-host     Optional Chrome native messaging bridge
apps/win-uia-helper  C#/.NET Windows UI Automation helper and probes
packages/core        Shared schemas, TaskSpec/HandoffCard/Mission models, transforms, redaction, safety
packages/local-store Local JSON-file persistence
docs                 Architecture, setup, acceptance, and strategy docs
```

## Scripts

```powershell
pnpm install
pnpm build
pnpm lint
pnpm test

pnpm desktop:dev
pnpm desktop:package
pnpm desktop:dist
pnpm desktop:package:win
pnpm desktop:package:mac

pnpm dev:extension
pnpm dev:native-host
pnpm test:win-uia-helper
```

The packaged Windows app is written to:

```text
apps/desktop/release/win-unpacked/AgentBridge.exe
```

macOS packaging is configured with `dmg` and `zip` targets. Signing and notarization are future production requirements.

A local desktop shortcut can point directly to that executable.

## Current Status

Implemented:

- Packaged Electron desktop app with compact `760x940` default window.
- Workbench-first UI focused on Planner -> Codex -> verification -> Planner review.
- Provider model for OpenAI Planner and Codex Executor profiles, sessions, turns, and events.
- OpenAI Planner provider using the Responses API through the official SDK, with API-key-from-environment setup.
- Codex Executor provider wrapping new-thread deep links, existing-thread open-only fallback, and App Server turn start.
- Workbench orchestration service for mission creation, Planner turns, TaskSpec creation, Codex send, verification, Planner review, and follow-up send.
- Autopilot runner for intent-first Manual/Supervised/Autonomous missions with approvals, stop conditions, steering, and durable run steps.
- Artifact Broker for local-first generated files, staged provider inputs, hashes, file bundles, file risk scanning, and artifact transfer controls.
- Codex provider events for turn start/progress/completion/failure, errors, App Server monitoring, and App Server steering.
- Optional Chrome extension/native-host path for external existing browser tabs.
- Cross-platform PlatformService for app data paths, bundled resources, file picker, external links, shell selection, and capability gating.
- Windows/macOS packaging configuration for the desktop app.
- ChatGPT Desktop source probe through Windows UI Automation, gated by capability.
- Mission, TaskSpec, HandoffCard, RepoContextPack, Artifact, Run, and VerificationResult schemas.
- Local JSON persistence for tasks, captures, links, artifacts, runs, verification results, and audit events.
- Deterministic TaskSpec compiler and Codex prompt renderer.
- Repo context with branch/status/changed-files and test/lint/typecheck command settings.
- Codex new-thread deep links, existing-thread deep-link open fallback, and App Server client support.
- Task Card Preview with explicit delivery mode and warnings.
- Mission-aware delivery attempts and audit provenance.
- User-triggered verification runner that stores git diff and command output artifacts.
- Failed verification follow-up HandoffCard drafts.
- Advanced surfaces for raw components, captures, sources, targets, links, audit, and demo tools.

## Known Limitations

- OpenAI Planner requires `OPENAI_API_KEY` or `AGENTBRIDGE_OPENAI_API_KEY` in the environment.
- Codex deep-link result observation is unavailable by design; Codex App Server sessions provide the event monitoring and steering path.
- Existing Codex thread continuation requires Codex App Server; deep links can only open an existing thread.
- Legacy ChatGPT/browser/Desktop capture is Advanced-only and still experimental.
- The optional Chrome extension still requires local unpacked-extension setup until there is a published extension ID.
- Firefox/external-browser support should be added as another optional adapter, not as the default flow.
- ChatGPT Desktop support depends on what the app exposes through Windows UI Automation.
- Generic Windows app delivery exists at the helper/service level but is not the polished primary UI path.
- macOS Accessibility and Apple Events helpers are not implemented.
- Packaged builds are not signed and do not auto-update yet.
- The packaged native host still assumes Node is available; a standalone native-host binary is a future hardening item.

## MVP Principles

- Capture is user-triggered.
- No silent scraping or background harvesting.
- Clipboard/manual/mock capture is not the production Workbench path.
- Official/programmatic target integrations are preferred over UI automation.
- UI automation is capability-gated and visibly risky when applicable.
- Verification commands are user-configured and user-confirmed before local execution.
- Data stays local by default.
