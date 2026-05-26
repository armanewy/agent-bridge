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

- Dashboard loads at `http://127.0.0.1:5173`.
- Mock source creates a capture.
- Codex target rejects invalid paths in Electron mode.
- Preview shows source, target, original excerpt, transformed prompt, redaction findings, and strategy.
- Dry-run Codex delivery creates a local delivery attempt.
- Audit view lists local events and can clear them.

## Windows UIA Helper

- `healthCheck` returns success.
- `listTopLevelWindows` includes Notepad when open.
- `findEditableTargets` returns Notepad edit controls.
- `deliverText` with `dryRun` never writes text.
- Clipboard fallback is not used unless explicitly requested.
