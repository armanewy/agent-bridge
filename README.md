# AgentBridge

AgentBridge is a local-first desktop app for turning intent into durable, verifiable work for coding agents.

The narrow product loop is now:

```text
AgentBridge hosted Planner
-> TaskSpec
-> Codex executor
-> verification artifacts
-> Planner review
-> optional Codex follow-up
```

The default production path does not require a browser extension, external ChatGPT tab, clipboard capture, ChatGPT Desktop probing, or an OpenAI API key in Simple Mode. The hosted AgentBridge Planner creates scoped coding direction; Codex executes through deep links or Codex App Server.

`http://127.0.0.1:5173` is development-only. The product surface is the packaged desktop app.

## Default Workbench Flow

1. Launch AgentBridge.
2. Sign in to AgentBridge.
3. Connect Codex or use deep-link fallback.
4. Describe the desired outcome once.
5. Start a Manual, Supervised, or Autonomous mission.
6. AgentBridge asks the hosted Planner, creates a TaskSpec, sends it to Codex, runs configured verification when a workspace is available, asks Planner to review, and drafts/sends follow-up work when policy allows it.

Repo/workspace selection is optional until the next action requires it. AgentBridge should infer workspace from Codex sessions/history when possible.

The detailed manual controls are still available in the expandable Workbench details panel:

```text
Ask Planner -> Generate TaskSpec -> Send to Codex -> Verify -> Planner Review -> Follow-up
```

Optional adapters remain under Advanced for importing external ChatGPT/browser/Desktop context, but they are not the first-run requirement.

## What AgentBridge Stores

AgentBridge stores local work records so the task can be resumed and audited:

- `Mission`: the durable user task.
- `WorkflowTemplate`: the typed provider-role loop for the mission.
- `TaskSpec`: the structured agent-ready task.
- `CompletionContract`: "done means X, verified by Y" acceptance and evidence rules.
- `HandoffCard`: one dispatch to Codex or another target.
- `RepoContextPack`: repo path, branch/status, changed files, and verification commands when workspace access is needed.
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
- Workflow templates for the default Planner/Reviewer -> Codex Executor -> local Verifier loop.
- Completion contracts that keep autonomous missions from passing without objective evidence.
- OpenAI Planner provider using the Responses API through the official SDK, with API-key-from-environment setup.
- Advanced Codex Local Planner provider for no-cloud dogfood mode through a separate Codex planning thread.
- Codex Executor provider wrapping new-thread deep links, existing-thread open-only fallback, and App Server turn start.
- Workbench orchestration service for mission creation, Planner turns, TaskSpec creation, Codex send, verification, Planner review, and follow-up send.
- Autopilot runner for intent-first Manual/Supervised/Autonomous missions with approvals, repeated-failure/no-change stop conditions, steering, and durable run steps.
- Mission queue, file conflict detection, and branch/worktree isolation service foundations for parallel mission safety.
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
- Hosted planner architecture docs for Simple Mode without OpenAI API-key friction.
- Repo-minimal policy docs for Bridge, Workspace, Verification, and Artifact/file modes.
- Mission-aware delivery attempts and audit provenance.
- User-triggered verification runner that stores git diff and command output artifacts.
- Failed verification follow-up HandoffCard drafts.
- Advanced surfaces for raw components, captures, sources, targets, links, audit, and demo tools.

## Known Limitations

- Hosted planner provider is the production target. Current BYOK planner requires `OPENAI_API_KEY` or `AGENTBRIDGE_OPENAI_API_KEY` until cloud auth/provider code lands.
- Codex deep-link result observation is unavailable by design; Codex App Server sessions provide the event monitoring and steering path.
- Existing Codex thread continuation requires Codex App Server; deep links can only open an existing thread.
- Advanced Codex Local Planner avoids hosted planning but uses Codex on both planning and execution sides, so it is not cross-agent diverse.
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
- LLM review alone cannot mark a mission autonomously complete; completion contracts require objective evidence or fall back to `needs_review`.
