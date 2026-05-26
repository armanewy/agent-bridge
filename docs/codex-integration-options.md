# Codex Integration Options

Sources checked on May 26, 2026:

- OpenAI Codex app commands: https://developers.openai.com/codex/app/commands
- OpenAI Codex SDK: https://developers.openai.com/codex/sdk
- OpenAI Codex app-server: https://developers.openai.com/codex/app-server

## Option 1: `codex://` Deep Links

OpenAI documents that the Codex app registers the `codex://` URL scheme. `codex://threads/new` opens a new local thread, and the documented query parameters include `prompt`, `path`, and `originUrl`. `path` must be an absolute path to a local directory.

### Fit

- Best current fallback path.
- Reliable enough for starting a new thread with `codex://threads/new?prompt=...&path=...`.
- Can open an existing local thread with `codex://threads/<thread-id>`.
- Existing-thread deep links do not inject a prompt into that thread. AgentBridge must show this as "opened existing thread; prompt staged but not sent" unless app-server or SDK delivery is active.

## Option 2: Codex TypeScript SDK

The official SDK page describes `@openai/codex-sdk` for server-side Node.js 18+ integrations. It can start a thread, run prompts, call `run()` again on the same thread, and resume a past thread by ID.

### Fit

- Strong candidate for the next adapter.
- Better than deep links for continuing threads and observing final responses.
- Requires dependency, auth/session assumptions, and a clearer packaging story.

## Option 3: Codex App Server

The app-server docs expose JSON-RPC methods for starting, resuming, reading, and managing threads. Documented methods include `thread/list`, `thread/loaded/list`, `thread/read`, `thread/resume`, and `turn/start`.

### Fit

- Preferred path for continuing an existing Codex session.
- `thread/resume` reopens an existing thread and `turn/start` appends a new turn to that target thread.
- Supports future observation of thread status and turn progress.
- Higher complexity and requires careful handling of approval policy, sandbox policy, shell commands, and thread lifecycle.

## Option 4: UI Automation Fallback

Use Windows UI Automation only if official routes fail or the user explicitly chooses a generic app target.

### Fit

- Useful for generic textboxes.
- Wrong-target and command-execution risks are higher.
- Not preferred for Codex.

## Recommendation

Use three modes:

1. New thread: `codex://threads/new?prompt=...&path=...`.
2. Existing thread fallback: `codex://threads/<thread-id>` opens the session only and keeps the generated prompt available in AgentBridge.
3. Existing thread continuation: Codex App Server `thread/resume` plus `turn/start` sends the generated prompt into the selected thread.

Keep SDK as a future implementation path for resume/run if app-server is unavailable or too unstable for packaged desktop use.

## Current Implementation Status

- `CodexAppServerClient` has mocked-test coverage for `thread/list`, `thread/loaded/list`, `thread/read`, `thread/resume`, and `turn/start`.
- `CodexSessionService` merges app-server sessions, loaded sessions, manual thread refs, and existing deep-link targets into `CodexThreadRef` records.
- Delivery routing uses app-server `thread/resume` plus `turn/start` for existing-thread continuation when configured.
- Deep-link fallback opens existing threads without claiming the prompt was injected.
