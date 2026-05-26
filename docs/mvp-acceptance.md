# MVP Acceptance

## Pass Criteria

- Simple Mode production capture requires the Chrome extension; clipboard/manual/mock capture is not the production path.
- The desktop Start page offers `Connect Chrome` when no ChatGPT tabs are synced.
- The desktop app registers or repairs the native messaging host for the configured production extension ID.
- Extension heartbeat shows whether Chrome is connected and when it last contacted the desktop app.
- A Chrome extension can sync an existing ChatGPT tab as a source.
- A Chrome extension can explicitly capture selected text.
- The native host persists browser sources and captures locally.
- The desktop app lists real native-host captures by default; mock capture remains an explicit development action.
- The desktop app offers `Create Task Card` after the user selects a capture and repo/agent target.
- The desktop app can list source/capture state from the local store.
- A user can configure a Codex deep-link target by repository path.
- A deterministic transform creates a structured handoff.
- A deterministic transform creates a Mission, TaskSpec, HandoffCard, and generated prompt artifact.
- Repo context is attached when a Codex target has a configured repository path.
- The Task Card Preview shows task title, goal, repo, target agent, acceptance criteria, verification commands, warnings, and expandable raw prompt/source details.
- Dry-run Codex delivery generates the exact deep link without opening Codex.
- Approved Codex delivery opens `codex://threads/new?prompt=...&path=...` in Electron mode.
- Existing ChatGPT tabs/conversations are supported through extension tab binding/discovery and explicit selected-text/latest-message capture.
- ChatGPT Desktop is supported as a probed source candidate when Windows UI Automation exposes the current visible conversation, selected text, or visible message text.
- ChatGPT Desktop source support must show confidence and must not claim full desktop conversation/tab enumeration unless the UIA tree exposes it.
- A user can choose "New Codex thread" or save/select an existing Codex thread ID.
- Existing Codex threads can be opened with `codex://threads/<thread-id>`.
- Existing Codex thread continuation sends a prompt only when Codex App Server is available and `thread/resume` plus `turn/start` succeeds.
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
- Development builds can still use manual extension ID entry under diagnostics.
- The Tasks detail view shows source capture excerpt, TaskSpec, artifacts, delivery attempts, timeline, next action, and verification status.
- The desktop renderer uses mock data when running outside Electron.
- Generic Windows app delivery is available at the helper/service level but not yet a polished UI flow.
- Codex App Server transport is optional and must be configured in development with `CODEX_APP_SERVER_URL`.
- Existing-thread observation is not implemented yet.
- ChatGPT Desktop UIA quality depends on the app's accessibility tree. If only a generic WebView shell is exposed, desktop source support is detection-only.
