# Backlog

## Done In Waves 7-13

- Mission / HandoffCard / TaskSpec core model.
- Local-store v2 for missions, artifacts, runs, and verification results.
- Repo context pack attached to Codex handoffs.
- Mission UI and task history.
- User-triggered verification runner.
- Failed-verification follow-up draft HandoffCards.
- First-run setup status and native-host manifest generation.
- Real capture-to-Mission default flow.
- Mission-aware delivery provenance.
- Connect-first Link Center with explicit source, workspace, and target selection.
- Verification preflight and artifact viewer.
- Follow-up HandoffCard dry-run/send path.
- Extension broad content-script removal.
- Simple Mode navigation: Connect, Tasks, Settings, Advanced.
- Task Card Preview copy and layout.
- Guided setup wizard presentation.
- Task detail timeline, next action, and readable work record.
- Chrome keyboard capture command and desktop quick actions.
- Electron packaging for an unpacked Windows app target.
- Packaged helper resource layout for native host and Windows UIA helper.
- Desktop app menu, About dialog, data folder/log actions, and clear local data action.
- LinkableComponent and WorkflowLink models with v3 local-store persistence.
- Browser-tab discovery protocol through the extension/native host, with optional `tabs` permission.
- Desktop-window discovery as detected components with compatibility and risk badges.
- Capability badges for Capture, Send, Verify, Observe, Official route, Risky, and Unsupported.
- Workflow Link to Task Card creation using the latest matching capture.

## P0 Dogfood Hardening

- Add a visible end-to-end demo script result after real extension capture.
- Add Codex repo directory picker.
- Replace packaged native-host Node dependency with a standalone native-host binary.
- Add production Chrome Web Store extension ID/install path.
- Polish quick-action routing in packaged Electron with a real tray icon.
- Promote real browser-tab discovery state from the extension into the desktop app automatically when Chrome connects.
- Add a no-capture helper action from Link cards that tells the user exactly how to capture from the linked tab.
- Show target verification diff before any future Windows delivery UI.

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
