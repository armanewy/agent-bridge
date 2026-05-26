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

`http://127.0.0.1:5173` is development-only. The product surface is the packaged desktop app, `AgentBridge.exe`.

## Default Workbench Flow

1. Launch AgentBridge.
2. Choose the local repo Codex should work in.
3. Ask the OpenAI Planner what Codex should do.
4. Generate a TaskSpec from the Planner response.
5. Select a Codex target: new thread or existing thread/session.
6. Send the TaskSpec to Codex.
7. Run verification when Codex changes the repo.
8. Ask the Planner to review the verification result.
9. Send a follow-up TaskSpec to Codex when needed.

Optional adapters remain under Advanced for importing external ChatGPT/browser/Desktop context, but they are not the first-run requirement.

## What AgentBridge Stores

AgentBridge stores local work records so the task can be resumed and audited:

- `Mission`: the durable user task.
- `TaskSpec`: the structured agent-ready task.
- `HandoffCard`: one dispatch to Codex or another target.
- `RepoContextPack`: repo path, branch/status, changed files, and verification commands.
- `Artifact`: captured text, generated prompt, delivery result, git diff, test output, follow-up prompt, and related evidence.
- `VerificationResult`: pass/fail/needs-review status and command results.

Data is local by default under `%LOCALAPPDATA%\AgentBridge` unless `AGENTBRIDGE_STORE_DIR` is set.

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

pnpm dev:extension
pnpm dev:native-host
pnpm test:win-uia-helper
```

The packaged Windows app is written to:

```text
apps/desktop/release/win-unpacked/AgentBridge.exe
```

A local desktop shortcut can point directly to that executable.

## Current Status

Implemented:

- Packaged Electron desktop app with compact `760x940` default window.
- Workbench-first UI focused on Planner -> Codex -> verification -> Planner review.
- Provider model for OpenAI Planner and Codex Executor profiles, sessions, turns, and events.
- OpenAI Planner provider using the Responses API through the official SDK, with API-key-from-environment setup.
- Codex Executor provider wrapping new-thread deep links, existing-thread open-only fallback, and App Server turn start.
- Workbench orchestration service for mission creation, Planner turns, TaskSpec creation, Codex send, verification, Planner review, and follow-up send.
- Optional Chrome extension/native-host path for external existing browser tabs.
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
- Codex result observation is not implemented yet.
- Existing Codex thread continuation requires Codex App Server; deep links can only open an existing thread.
- Legacy ChatGPT/browser/Desktop capture is Advanced-only and still experimental.
- The optional Chrome extension still requires local unpacked-extension setup until there is a published extension ID.
- Firefox/external-browser support should be added as another optional adapter, not as the default flow.
- ChatGPT Desktop support depends on what the app exposes through Windows UI Automation.
- Generic Windows app delivery exists at the helper/service level but is not the polished primary UI path.
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
