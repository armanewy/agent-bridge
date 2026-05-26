# Backlog

## Done In Waves 7-11

- Mission / HandoffCard / TaskSpec core model.
- Local-store v2 for missions, artifacts, runs, and verification results.
- Repo context pack attached to Codex handoffs.
- Mission UI and task history.
- User-triggered verification runner.
- Failed-verification follow-up draft HandoffCards.
- First-run setup status and native-host manifest generation.
- Real capture-to-Mission default flow.
- Mission-aware delivery provenance.
- Capture Inbox and explicit Target Selector.
- Verification preflight and artifact viewer.
- Follow-up HandoffCard dry-run/send path.
- Extension broad content-script removal.
- Simple Mode navigation: Inbox, Tasks, Settings, Advanced.
- Task Card Preview copy and layout.
- Guided setup wizard presentation.
- Task detail timeline, next action, and readable work record.
- Chrome keyboard capture command and desktop quick actions.

## P0 Dogfood Hardening

- Add Codex repo directory picker.
- Add a visible end-to-end demo script result after real extension capture.
- Improve setup path resolution for packaged Electron vs development repo root.
- Polish quick-action routing in packaged Electron with a real tray icon.
- Show target verification diff before Windows delivery.
- Block terminal-like Windows targets unless the user confirms command-execution risk.

## P1 MVP Improvements

- Windows target binding UI for foreground window and top-level window list.
- Redaction preview actions: redact and continue, edit manually, cancel, allow once.
- Audit detail view for one Task Card/HandoffCard with delivery attempts.
- Better artifact filtering by kind and run.
- Manual acceptance-test checklist for the full ChatGPT-to-Codex-to-verification loop.

## P2 Execution Integrations

- Codex SDK/app-server adapter for continuing existing threads and observing delivery status.
- Codex result ingestion as `modelResponse` artifacts.
- Provider-specific browser adapters only after explicit opt-in.
- Cursor/VS Code target adapters through official extension APIs where possible.

## P3 Team And Governance

- Team policy packs for fallback strategies.
- Shared redaction rules.
- Exportable audit bundles.
- Admin-managed target allowlists.

## Next Three Features

1. Real dogfood run and demo recording/checklist from ChatGPT selected text to Codex follow-up.
2. Codex app-server/SDK spike for continuing and observing threads.
3. Windows target UI hardening only after the Codex mission loop feels reliable.
