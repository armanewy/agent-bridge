# MVP Acceptance

## Pass Criteria

- Simple Mode's lowest-friction production path is the AgentBridge-owned ChatGPT web window; no browser extension is required for that path.
- Browser extensions are optional adapters for users who want to bind existing Chrome/Firefox/other browser tabs later.
- The desktop Start page offers `Open ChatGPT here` when no ChatGPT source is configured.
- The packaged desktop app opens at 760x940, has minimum size 680x760, and the Start screen has no horizontal scrolling at that size.
- Simple Mode is progressively disclosed: source first, repo second, Codex/session third, then Create Link/Create Task Card.
- If Chrome is connected but no ChatGPT tab has been synced, Simple Mode tells the user to sync the existing ChatGPT tab through the extension instead of repeating setup jargon.
- The desktop app registers or repairs the native messaging host for the configured production extension ID.
- Extension heartbeat shows whether Chrome is connected and when it last contacted the desktop app.
- A Chrome extension can sync an existing ChatGPT tab as a source.
- A Chrome extension can explicitly capture selected text.
- AgentBridge can open ChatGPT in its own browser window, bind that window as a source, and capture selected text from it after a user click.
- AgentBridge can open either a new ChatGPT session or a pasted existing ChatGPT conversation URL in its own browser window.
- The native host persists browser sources and captures locally.
- The desktop app lists real native-host captures by default; mock capture remains an explicit development action.
- The desktop app offers `Create Task Card` after the user selects a capture and repo/agent target.
- The desktop app can list source/capture state from the local store.
- A user can configure a Codex deep-link target by repository path.
- A deterministic transform creates a structured handoff.
- A deterministic transform creates a Mission, TaskSpec, HandoffCard, and generated prompt artifact.
- Repo context is attached when a Codex target has a configured repository path.
- The Task Card Preview shows task title, goal, repo, target agent, acceptance criteria, verification commands, warnings, and expandable raw prompt/source details.
- The Task Card Preview shows whether delivery will create a new Codex thread, send into an existing thread via App Server, or only open an existing thread with the prompt staged.
- Dry-run Codex delivery generates the exact deep link without opening Codex.
- Approved Codex delivery opens `codex://threads/new?prompt=...&path=...` in Electron mode.
- Existing ChatGPT tabs/conversations are supported through extension tab binding/discovery and explicit selected-text/latest-message capture.
- ChatGPT Desktop is supported as a probed source candidate when Windows UI Automation exposes the current visible conversation, selected text, or visible message text.
- ChatGPT Desktop source support must show confidence and must not claim full desktop conversation/tab enumeration unless the UIA tree exposes it.
- A user can choose "New Codex thread" or save/select an existing Codex thread ID.
- Existing Codex threads can be opened with `codex://threads/<thread-id>`.
- Existing Codex thread continuation sends a prompt only when Codex App Server is available and `thread/resume` plus `turn/start` succeeds.
- Settings shows Codex App Server configured/connected status and whether existing Codex sessions are send-capable.
- Existing-thread deep-link fallback must warn that the prompt was staged but not injected.
- Delivery attempts and audit events are stored locally with Mission and HandoffCard provenance.
- Verification creates git diff/output artifacts and a VerificationResult.
- Failed verification creates an inspectable follow-up HandoffCard that can be dry-run or sent manually.

## Fail Criteria

- Capture happens without a user gesture.
- Extension requests broad host permissions or registers all-page content scripts by default.
- Simple Mode recommends clipboard/manual/mock capture.
- ChatGPT Desktop support falls back to clipboard capture in Simple Mode.
- Delivery happens without an approval preview.
- Clipboard fallback runs without explicit approval.
- Suspected secrets are sent without warning.
- The app cannot clear local audit events.

## Known Limitations

- Production builds need a stable Chrome extension ID and Web Store listing URL.
- Development builds can still use manual extension ID entry in Settings for optional unpacked-extension testing.
- The Tasks detail view shows source capture excerpt, TaskSpec, artifacts, delivery attempts, timeline, next action, and verification status.
- The desktop renderer uses mock data when running outside Electron.
- Generic Windows app delivery is available at the helper/service level but not yet a polished UI flow.
- Codex App Server transport is optional and must be configured in development with `CODEX_APP_SERVER_URL`.
- Existing-thread observation is not implemented yet.
- ChatGPT Desktop UIA quality depends on the app's accessibility tree. If only a generic WebView shell is exposed, desktop source support is detection-only.
