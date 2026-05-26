# MVP Acceptance

## Pass Criteria

- A Chrome extension can bind the active tab as a source.
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
- Delivery happens without an approval preview.
- Clipboard fallback runs without explicit approval.
- Suspected secrets are sent without warning.
- The app cannot clear local audit events.

## Known Limitations

- The browser-to-desktop flow still depends on development native-host registration.
- The Tasks detail view shows source capture excerpt, TaskSpec, artifacts, delivery attempts, timeline, next action, and verification status.
- The desktop renderer uses mock data when running outside Electron.
- Generic Windows app delivery is available at the helper/service level but not yet a polished UI flow.
- Codex App Server transport is optional and must be configured in development with `CODEX_APP_SERVER_URL`.
- Existing-thread observation is not implemented yet.
