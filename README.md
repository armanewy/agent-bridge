# AgentBridge

AgentBridge is a local-first AI BuildOps assistant for developer tasks. It turns explicitly captured browser context into a durable Task Card with a structured TaskSpec, repo context, Codex delivery provenance, local artifacts, verification results, and follow-up drafts.

AgentBridge is intended to run as a desktop application. `http://127.0.0.1:5173` is a development-only Vite preview; production users launch `AgentBridge.exe`.

## MVP Principles

- Capture is user-triggered.
- Browser capture uses browser-native extension APIs and explicit script injection.
- Codex delivery uses documented `codex://threads/new?prompt=...&path=...` deep links first.
- Verification commands are user-configured and user-confirmed before local execution.
- Data is local by default.
- Windows desktop targeting uses Windows UI Automation before any fallback.
- Clipboard fallback is explicit and approval-gated.

## Current Product Flow

```text
Browser selected text
-> Linkable Component
-> Workflow Link
-> Task Card
-> TaskSpec
-> RepoContextPack
-> HandoffCard
-> Task Card Preview
-> Codex delivery
-> VerificationResult
-> Artifacts
-> optional follow-up HandoffCard
```

## Default UX

The default desktop UI is Simple Mode:

- Connect: detect linkable browser tabs, repos, desktop windows, and agent targets; create reusable routes such as `ChatGPT tab -> repo -> Codex`.
- Tasks: inspect task history, generated prompts, artifacts, verification results, and follow-up drafts.
- Settings: connect Chrome, choose a repo, configure Codex, and set verification commands.
- Advanced: raw Sources, Targets, Links, and Audit views for debugging the local pipeline.

## Workspace Map

```text
apps/desktop         Electron + React companion UI and local services
apps/extension       Chrome Manifest V3 extension
apps/native-host     Chrome native messaging host
apps/win-uia-helper  C#/.NET Windows UI Automation helper
packages/core        Shared schemas, TaskSpec/HandoffCard/Mission models, transforms, redaction, safety
packages/local-store Local JSON-file persistence
docs                 Architecture, setup, acceptance, and strategy docs
```

## Scripts

```powershell
pnpm install
pnpm build
pnpm test
pnpm dev:desktop
pnpm desktop:dev
pnpm desktop:package
pnpm desktop:dist
pnpm dev:extension
pnpm dev:native-host
dotnet test apps/win-uia-helper/tests/AgentBridge.WinUiaHelper.Tests.csproj
```

## Current Status

Waves 1-13 are implemented through desktop packaging, service masking, and the Link Center:

- LinkableComponent and WorkflowLink schemas with local persistence.
- Connect-first UI with Browser Tabs, Repos / Workspaces, Desktop Windows / Agents, and Links sections.
- Explicit extension action for optional browser-tab discovery; content capture remains user-triggered.
- Desktop component discovery for saved browser sources, Codex targets, repo context, and Windows windows where the UIA helper is available.
- Mission-first core schemas and v3 local persistence.
- Deterministic TaskSpec compiler and Codex prompt renderer.
- Repo context pack with branch/status/changed-files and verification command settings.
- Desktop Connect, Tasks, Settings, Advanced mode, artifact viewer, and verification preflight.
- Mission-aware Codex delivery attempts and audit provenance.
- User-triggered verification runner that stores git diff and command output artifacts.
- Failed verification creates a visible, sendable follow-up HandoffCard.
- Extension capture uses `activeTab`, `scripting`, and `nativeMessaging` without broad content scripts.
- Extension keyboard command and desktop quick actions open the task-card flow without navigating the dashboard.
- Default desktop navigation is Connect, Tasks, Settings, and Advanced instead of exposing internals first.
- Electron packaging produces a Windows unpacked app target with bundled native-host and Windows UIA helper resources.
- Settings presents Chrome/repo/Codex onboarding with diagnostics behind Advanced details.

## Known Limitations

- Codex deep links open new threads only; no Codex result observation yet.
- Chrome native messaging still requires developer-mode extension setup.
- Generic Windows app delivery exists at helper/service level but is not the primary polished UI path.
- ChatGPT latest-message capture is best-effort and secondary to selected-text capture.
- Packaged builds are not signed and do not auto-update yet.
- The packaged native host still assumes Node is available; a standalone native-host binary is a future hardening item.
