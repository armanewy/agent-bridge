# AgentBridge

AgentBridge is a local-first desktop app for turning intent into durable, verifiable work for coding agents.

The narrow product loop is now:

```text
ChatGPT handoff
-> TaskSpec
-> Codex executor
-> verification artifacts
-> user review / follow-up
-> optional Codex follow-up
```

The default production path is the ChatGPT planner handoff. The user writes a mission, asks ChatGPT for a structured plan, imports that plan into AgentBridge, and AgentBridge parses it locally before handing scoped work to Codex.

`http://127.0.0.1:5173` is development-only. The product surface is the packaged desktop app.

## Default Workbench Flow

1. Launch AgentBridge.
2. Connect Codex through Codex App Server.
3. Describe the desired outcome once.
4. Use the ChatGPT planner action and import the selected ChatGPT plan.
5. Start a Manual, Supervised, or Autonomous mission.
6. AgentBridge creates a TaskSpec, sends it to Codex, runs configured verification when a workspace is available, and surfaces evidence for user review or follow-up work.

Repo/workspace selection is optional until the next action requires it. AgentBridge should infer workspace from Codex sessions/history when possible.

The detailed manual controls are still available in the expandable Workbench details panel:

```text
Plan with ChatGPT -> Generate TaskSpec -> Send to Codex -> Verify -> Review -> Follow-up
```

Advanced contains current pipeline diagnostics and audit state, not alternate production routes.

## What AgentBridge Stores

AgentBridge stores local work records so the task can be resumed and audited:

- `Mission`: the durable user task.
- `WorkflowTemplate`: the typed provider-role loop for the mission.
- `TaskSpec`: the structured agent-ready task.
- `CompletionContract`: "done means X, verified by Y" acceptance and evidence rules.
- `HandoffCard`: one dispatch to Codex or another target.
- `RepoContextPack`: repo path, branch/status, changed files, and verification commands when workspace access is needed.
- `Artifact`: imported planner text, generated prompt, delivery result, git diff, test output, follow-up prompt, and related evidence.
- `VerificationResult`: pass/fail/needs-review status and command results.

Data is local by default under the Electron user-data directory unless `AGENTBRIDGE_STORE_DIR` is set. Non-Electron data paths are `%LOCALAPPDATA%\AgentBridge` on Windows and `~/Library/Application Support/AgentBridge` on macOS.

## Codex Delivery

AgentBridge sends work to Codex only through Codex App Server. It uses `thread/start`, `thread/resume`, `turn/start`, and event reads so the app can display real mission progress instead of merely opening Codex.

## Workspace Map

```text
apps/desktop         Electron + React desktop app, local services, tray/shortcut, Codex delivery
apps/win-uia-helper  C#/.NET Windows UI Automation helper and probes
packages/core        Shared schemas, TaskSpec/HandoffCard/Mission models, redaction, safety
packages/local-store Local JSON-file persistence
docs                 Current architecture and product notes
```

## Scripts

```powershell
pnpm install
pnpm build
pnpm lint
pnpm test

pnpm dev:local
pnpm desktop:dev
pnpm desktop:package
pnpm desktop:dist
pnpm desktop:package:win
pnpm desktop:package:mac

pnpm test:win-uia-helper
```

`pnpm dev:local` is the lowest-friction local app launcher. It loads optional gitignored `.env.local` configuration, starts the minimal local AgentBridge Cloud auth scaffold on a free port, seeds development auth for that local process, then opens the Electron desktop with `AGENTBRIDGE_CLOUD_URL` already wired. It does not create, seed, or run missions; paste mission prompts into the Workbench yourself.

For the ChatGPT planner handoff, write the mission in Workbench, use the ChatGPT planner action, and bring the selected ChatGPT plan back into AgentBridge. AgentBridge parses the readable plan, displays it as a task with criteria and checks, and continues with TaskSpec -> Codex -> verification.

The packaged Windows app is written to:

```text
apps/desktop/release/win-unpacked/AgentBridge.exe
```

macOS packaging is configured with `dmg` and `zip` targets. Signing and notarization are future production requirements.

A local desktop shortcut can point directly to that executable.

## Current Status

Implemented:

- Packaged Electron desktop app with compact `760x940` default window.
- Workbench-first UI focused on ChatGPT handoff -> Codex -> verification -> user review.
- Provider model for Codex Executor profiles, sessions, turns, and events.
- Workflow templates for the default ChatGPT handoff -> Codex Executor -> local Verifier loop.
- Completion contracts that keep autonomous missions from passing without objective evidence.
- Codex Executor provider using Codex App Server turn start, event monitoring, and steering.
- Workbench orchestration service for mission creation, imported ChatGPT plans, TaskSpec creation, Codex send, verification, and follow-up send.
- Autopilot runner for intent-first Manual/Supervised/Autonomous missions with approvals, repeated-failure/no-change stop conditions, steering, and durable run steps.
- Mission queue, file conflict detection, and branch/worktree isolation service foundations for parallel mission safety.
- Artifact Broker for local-first generated files, staged provider inputs, hashes, file bundles, file risk scanning, and artifact transfer controls.
- Codex provider events for turn start/progress/completion/failure, errors, App Server monitoring, and App Server steering.
- Cross-platform PlatformService for app data paths, bundled resources, file picker, safe external links, shell selection, and capability gating.
- Windows/macOS packaging configuration for the desktop app.
- Mission, TaskSpec, HandoffCard, RepoContextPack, Artifact, Run, and VerificationResult schemas.
- Local JSON persistence for missions, provider sessions, artifacts, runs, verification results, and audit events.
- Deterministic TaskSpec compiler and Codex prompt renderer.
- Repo context with branch/status/changed-files and test/lint/typecheck command settings.
- Task Card Preview with explicit delivery mode and warnings.
- Repo-minimal policy docs for Bridge, Workspace, Verification, and Artifact/file modes.
- Mission-aware delivery attempts and audit provenance.
- User-triggered verification runner that stores git diff and command output artifacts.
- Failed verification follow-up HandoffCard drafts.
- Advanced surfaces for current pipeline components and audit events.

## Known Limitations

- Codex execution requires Codex App Server; there is no production open-only route.
- Generic Windows app delivery exists at the helper/service level but is not the polished primary UI path.
- macOS Accessibility and Apple Events helpers are not implemented.
- Packaged builds are not signed and do not auto-update yet.

## MVP Principles

- No silent scraping or background harvesting.
- ChatGPT plan import is the production planning path.
- Official/programmatic target integrations are preferred over UI automation.
- UI automation is capability-gated and visibly risky when applicable.
- Verification commands are user-configured and user-confirmed before local execution.
- Data stays local by default.
- LLM review alone cannot mark a mission autonomously complete; completion contracts require objective evidence or fall back to `needs_review`.
