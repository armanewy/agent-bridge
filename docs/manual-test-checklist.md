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
- Start screen fits in the compact window without horizontal scrolling.
- Simple Mode uses progressive disclosure: show ChatGPT source first, show repo only after the source is readable/synced, and show Codex only after a repo target exists.
- Vite development preview loads Start at `http://127.0.0.1:5173`.
- Mock capture is labeled demo-only.
- Demo capture tools are only under Advanced.
- Simple Mode does not show clipboard/manual/mock capture as a production path.
- If no ChatGPT tabs are synced, Start shows `No ChatGPT tabs found` and `Connect Chrome`.
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
- Settings shows Codex App Server status and whether existing-thread delivery is send-capable or open-only fallback.
- Task Card Preview shows the exact Codex delivery mode before sending.
- New-thread delivery still uses `codex://threads/new?prompt=...&path=...`.
- Tasks view shows timeline, next action, artifacts, delivery attempts, and verification state.
- Advanced Audit view lists local events and can clear them.

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
