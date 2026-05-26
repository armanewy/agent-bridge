# Codex Integration Options

Sources checked on May 26, 2026:

- OpenAI Codex app commands: https://developers.openai.com/codex/app/commands
- OpenAI Codex SDK: https://developers.openai.com/codex/sdk
- OpenAI Codex app-server: https://developers.openai.com/codex/app-server

## Option 1: `codex://` Deep Links

OpenAI documents that the Codex app registers the `codex://` URL scheme. `codex://threads/new` opens a new local thread, and the documented query parameters include `prompt`, `path`, and `originUrl`. `path` must be an absolute path to a local directory.

### Fit

- Best current MVP path.
- Reliable enough for starting a new thread.
- Low setup complexity.
- No direct way to observe the result or continue an existing thread beyond opening `codex://threads/<thread-id>`.

## Option 2: Codex TypeScript SDK

The official SDK page describes `@openai/codex-sdk` for server-side Node.js 18+ integrations. It can start a thread, run prompts, call `run()` again on the same thread, and resume a past thread by ID.

### Fit

- Strong candidate for the next adapter.
- Better than deep links for continuing threads and observing final responses.
- Requires dependency, auth/session assumptions, and a clearer packaging story.

## Option 3: Codex App Server

The app-server docs expose JSON-RPC methods for starting, resuming, reading, and managing threads. Documented methods include `thread/start`, `thread/resume`, `turn/start`, `thread/read`, `thread/turns/list`, `thread/inject_items`, and status-change notifications.

### Fit

- Most powerful local integration path.
- Supports observing thread status and turn progress.
- Higher complexity and requires careful handling of approval policy, sandbox policy, shell commands, and thread lifecycle.

## Option 4: UI Automation Fallback

Use Windows UI Automation only if official routes fail or the user explicitly chooses a generic app target.

### Fit

- Useful for generic textboxes.
- Wrong-target and command-execution risks are higher.
- Not preferred for Codex.

## Recommendation

Keep deep links for the MVP. Add a Codex SDK adapter next for start/resume/run and result observation. Use app-server only after the SDK path proves insufficient, because app-server is powerful but expands the security and lifecycle surface.
