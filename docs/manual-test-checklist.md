# Manual Test Checklist

## Core

- `pnpm build` passes.
- `pnpm test` passes.
- `dotnet test apps/win-uia-helper/tests/AgentBridge.WinUiaHelper.Tests.csproj` passes.

## Browser Extension

- Extension loads unpacked without broad host permissions.
- `Bind current tab as source` sends a native host message.
- `Capture selected text` requires selected text.
- Native host unavailable shows a visible popup error.
- No capture happens on page load, tab update, or timer.

## Native Host

- `healthCheck` returns a framed success response.
- `bindSource` converts tab metadata into a `BrowserTabSource`.
- `capture` rejects empty text.
- Converted captures persist to `%LOCALAPPDATA%\AgentBridge` unless `AGENTBRIDGE_STORE_DIR` is set.

## Desktop

- `pnpm desktop:package` creates `apps/desktop/release/win-unpacked/AgentBridge.exe`.
- `AgentBridge.exe` launches without requiring a browser pointed at localhost.
- Vite development preview loads Start at `http://127.0.0.1:5173`.
- Mock capture is labeled demo-only.
- Demo capture tools are only under Advanced.
- Codex target rejects invalid paths in Electron mode.
- Task Card Preview shows task title, repo/agent, acceptance criteria, verification steps, redaction warnings, and expandable raw prompt/source details.
- Dry-run Codex delivery creates a local delivery attempt.
- Tasks view shows timeline, next action, artifacts, delivery attempts, and verification state.
- Advanced Audit view lists local events and can clear them.

## Windows UIA Helper

- `healthCheck` returns success.
- `listTopLevelWindows` includes Notepad when open.
- `findEditableTargets` returns Notepad edit controls.
- `deliverText` with `dryRun` never writes text.
- Clipboard fallback is not used unless explicitly requested.
