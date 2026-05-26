# Backlog

## P0 Fixes

- Add Codex repo directory picker.
- Build native-host manifest generator using the actual extension ID and host path.
- Show target verification diff before Windows delivery.
- Block terminal-like Windows targets unless the user confirms command-execution risk.

## P1 MVP Improvements

- Full selected-text extension to desktop to Codex approval workflow.
- Windows target binding UI for foreground window and top-level window list.
- Redaction preview actions: redact and continue, edit manually, cancel, allow once.
- Audit detail view for one handoff with delivery attempts.

## P2 Provider Expansion

- Claude/Gemini selected-text adapters only.
- Provider-specific latest-message adapters after explicit user opt-in.
- Cursor/VS Code target adapters through official extension APIs where possible.
- Codex SDK/app-server adapter for continuing existing threads.

## P3 Team And Governance

- Team policy packs for fallback strategies.
- Shared redaction rules.
- Exportable audit bundles.
- Admin-managed target allowlists.

## Next Three Features

1. Native-host setup wizard.
2. Real source-to-Codex flow from extension capture without mock data.
3. Codex app-server spike promotion to continue existing threads and observe delivery status.
