# Manual Test Checklist

## Core

- `pnpm build` passes.
- `pnpm test` passes.
- `dotnet test apps/win-uia-helper/tests/AgentBridge.WinUiaHelper.Tests.csproj` passes.

## Browser Extension

- Extension loads unpacked without broad host permissions.
- Popup says `Desktop app: connected` after a successful health check.
- On ChatGPT, `Sync this ChatGPT tab` sends a native host message.
- On non-ChatGPT tabs, popup says to open ChatGPT.
- `Show all ChatGPT tabs` requests optional `tabs` permission only after click.
- `Capture selected text` requires selected text.
- `Capture latest answer` remains user-triggered.
- Native host unavailable shows a visible popup error.
- No capture happens on page load, tab update, or timer.

## Native Host

- `healthCheck` returns a framed success response.
- `healthCheck`, `bindSource`, `browserTabsDiscovered`, and `capture` update extension heartbeat.
- `bindSource` converts tab metadata into a `BrowserTabSource`.
- `capture` rejects empty text.
- Converted captures persist to `%LOCALAPPDATA%\AgentBridge` unless `AGENTBRIDGE_STORE_DIR` is set.

## Desktop

- `pnpm desktop:package` creates `apps/desktop/release/win-unpacked/AgentBridge.exe`.
- `AgentBridge.exe` launches without requiring a browser pointed at localhost.
- Packaged app opens at 760x940 with minimum size 680x760.
- Workbench screen fits in the compact window without horizontal scrolling.
- Simple Mode shows the Workbench only: repo, ChatGPT handoff, Codex, task state, verification, and review.
- Simple Mode does not require Chrome, ChatGPT Desktop, clipboard capture, manual capture, or demo data.
- Production Simple Mode does not ask for a model API key.
- With no repo selected, Workbench accepts intent and asks for workspace only when new Codex thread creation, verification, or repo file operations require it.
- With no repo selected, import a ChatGPT plan and generate TaskSpec; confirm neither step asks for a workspace.
- With an existing Codex session that reports cwd, confirm Workbench shows `Workspace inferred from Codex session` and can attach it with one click.
- With no workspace and no existing Codex session selected, confirm `Send TaskSpec to Codex` asks for a workspace before creating a new Codex thread.
- With no workspace, confirm `Run verification` asks for a workspace instead of failing generically.
- User can choose repo, create a Workbench task, import a ChatGPT plan, generate TaskSpec, send to Codex, run verification, review evidence, and send a follow-up.
- User can enter one intent, choose Supervised mode, click `Start Mission`, and see the mission timeline advance.
- User can start a ChatGPT-handoff mission without Chrome extension setup, ChatGPT Desktop, clipboard capture, or a mandatory repo picker.
- If Supervised mode reaches Codex delivery, a pending approval card appears before sending to Codex.
- Resolving an approval with `Approve` continues the same Autopilot run.
- `Stop` cancels an active Autopilot run and records the stop reason.
- Steering text creates a mission artifact; with Codex App Server and an active existing session it sends `turn/steer`.
- Latest provider event appears in the Workbench after Codex delivery or steering.
- The artifact tray lists local ChatGPT/Codex/verification artifacts and file records.
- Artifact tray actions can mark files for Codex follow-up or exclusion.
- Artifact tray `Reveal` opens the local artifact file folder when the file exists.
- Vite development preview loads Start at `http://127.0.0.1:5173`.
- Mock capture is labeled demo-only.
- Demo capture tools are only under Advanced.
- Simple Mode does not show clipboard/manual/mock capture as a production path.
- Advanced -> Legacy Link Center contains the old external ChatGPT/browser/capture/link flow.
- Advanced -> Components/Captures/Links/Sources/Targets/Audit expose raw records.
- Advanced legacy adapter: with no extension configured, Start shows `Open ChatGPT here`.
- Advanced legacy adapter: clicking `Open ChatGPT here` opens ChatGPT in an AgentBridge-owned window and binds it as the source.
- Advanced legacy adapter: pasting an existing ChatGPT conversation URL and clicking `Open existing conversation` opens that conversation in the AgentBridge-owned window and binds that URL as the source.
- Advanced legacy adapter: after selecting text in that AgentBridge-owned ChatGPT window, `Capture selection` saves a real local capture without installing a browser extension.
- If no ChatGPT tabs are synced and an extension is configured, Start shows `No ChatGPT tabs found` and `Connect Chrome`.
- If Chrome is connected but no ChatGPT tab is synced, Start says to sync the existing ChatGPT tab from the extension and does not show repo/Codex steps yet.
- Switch Start source mode to `ChatGPT Desktop`, open ChatGPT Desktop, and run `Probe ChatGPT Desktop`.
- If UIA exposes the current conversation, Start shows a ChatGPT Desktop source candidate with confidence.
- If UIA does not expose content, Start keeps the source unsupported and does not suggest clipboard capture.
- `Connect Chrome` registers or repairs the native host and opens the configured Chrome Web Store URL.
- Codex target rejects invalid paths in Electron mode.
- Task Card Preview shows task title, repo/agent, acceptance criteria, verification steps, redaction warnings, and expandable raw prompt/source details.
- Dry-run Codex delivery creates a local delivery attempt.
- Save a manual Codex thread ID from `/status` and select it on Start.
- Existing-thread dry run opens/stages `codex://threads/<thread-id>` and warns that the prompt is not injected without App Server.
- With `CODEX_APP_SERVER_URL` configured, existing-thread delivery resumes the selected thread and starts a turn.
- With `CODEX_APP_SERVER_URL` configured, Codex provider events are stored for turn start/completion and steering.
- With `CODEX_APP_SERVER_URL` configured, Codex monitoring records thread events before verification.
- Settings shows Codex App Server status and whether existing-thread delivery is send-capable or open-only fallback.
- Task Card Preview shows the exact Codex delivery mode before sending.
- New-thread delivery still uses `codex://threads/new?prompt=...&path=...`.
- Tasks view shows timeline, next action, artifacts, delivery attempts, and verification state.
- Advanced Audit view lists local events and can clear them.

## Hands-off Mission Runner

- Start a mission from one intent in Supervised mode.
- Confirm no Chrome extension, clipboard capture, manual capture, or ChatGPT Desktop probe is required.
- Confirm Autopilot pauses before Codex delivery unless the policy allows Codex turns.
- Confirm verification runs only configured commands.
- Confirm failed verification surfaces evidence and can draft a follow-up.
- Confirm no provider file upload happens unless policy allows it.
- Add a secret-looking `.env` artifact and confirm Autopilot pauses for approval before provider transfer.
- Confirm local artifact files are staged under the AgentBridge staging root, not written directly into the repo.

## Windows UIA Helper

- `healthCheck` returns success.
- `listTopLevelWindows` includes Notepad when open.
- `listChatGptWindows` lists ChatGPT Desktop windows when the app is open.
- `inspectChatGptWindow` returns a capability report with window detection, selected-text support, latest-message support, confidence, and raw UIA excerpt.
- `captureChatGptSelectedText` only succeeds when ChatGPT Desktop exposes selected text through UIA.
- `captureChatGptVisibleMessages` only succeeds when ChatGPT Desktop exposes visible message text through UIA.
- `findEditableTargets` returns Notepad edit controls.
- `deliverText` with `dryRun` never writes text.
- Clipboard fallback is not used unless explicitly requested.
