# AgentBridge

AgentBridge is a local-first AI BuildOps workspace for developer handoffs. It turns explicitly captured browser context into a durable Mission with a structured TaskSpec, repo context, Codex delivery provenance, local artifacts, verification results, and follow-up drafts.

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
-> Capture Inbox
-> Mission
-> TaskSpec
-> RepoContextPack
-> HandoffCard
-> approval preview
-> Codex delivery
-> VerificationResult
-> Artifacts
-> optional follow-up HandoffCard
```

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
pnpm dev:extension
pnpm dev:native-host
dotnet test apps/win-uia-helper/tests/AgentBridge.WinUiaHelper.Tests.csproj
```

## Current Status

Waves 1-10 are implemented through closed-loop dogfood hardening:

- Mission-first core schemas and v2 local persistence.
- Deterministic TaskSpec compiler and Codex prompt renderer.
- Repo context pack with branch/status/changed-files and verification command settings.
- Desktop Setup, Capture Inbox, Target Selector, Missions, artifact viewer, and verification preflight.
- Mission-aware Codex delivery attempts and audit provenance.
- User-triggered verification runner that stores git diff and command output artifacts.
- Failed verification creates a visible, sendable follow-up HandoffCard.
- Extension capture uses `activeTab`, `scripting`, and `nativeMessaging` without broad content scripts.

## Known Limitations

- Codex deep links open new threads only; no Codex result observation yet.
- Chrome native messaging still requires developer-mode extension setup.
- Generic Windows app delivery exists at helper/service level but is not the primary polished UI path.
- ChatGPT latest-message capture is best-effort and secondary to selected-text capture.
