# MVP Acceptance

## Pass Criteria

- A Chrome extension can bind the active tab as a source.
- A Chrome extension can explicitly capture selected text.
- The native host persists browser sources and captures locally.
- The desktop app lists real native-host captures by default; mock capture remains an explicit development action.
- The desktop app offers `Create Mission from selected capture` after the user selects a capture and target.
- The desktop app can list source/capture state from the local store.
- A user can configure a Codex deep-link target by repository path.
- A deterministic transform creates a structured handoff.
- The approval preview shows source, target, capture excerpt, transformed prompt, findings, and delivery strategy.
- Dry-run Codex delivery generates the exact deep link without opening Codex.
- Approved Codex delivery opens `codex://threads/new?prompt=...&path=...` in Electron mode.
- Delivery attempts and audit events are stored locally.

## Fail Criteria

- Capture happens without a user gesture.
- Extension requests broad host permissions or registers all-page content scripts by default.
- Delivery happens without an approval preview.
- Clipboard fallback runs without explicit approval.
- Suspected secrets are sent without warning.
- The app cannot clear local audit events.

## Known Limitations

- The browser-to-desktop flow still depends on development native-host registration.
- The Missions detail view shows source capture excerpt, TaskSpec, artifacts, delivery attempts, and verification status.
- The desktop renderer uses mock data when running outside Electron.
- Generic Windows app delivery is available at the helper/service level but not yet a polished UI flow.
- Codex deep links open new threads only.
