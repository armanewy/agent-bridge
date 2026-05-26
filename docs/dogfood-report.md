# Dogfood Report

## Workflow Simulated

- Browser selected text to Codex deep link: simulated through the desktop mock source, Codex target configuration, approval preview, and dry-run delivery.
- Browser selected text to Notepad: helper/service path exists, but the polished UI flow is not complete.
- Transform preview: working with deterministic recipes.
- Redaction warning: working at the core scan layer; high-severity storage defaults still need UI polish.
- Target mismatch behavior: scoring exists, but the UI does not yet show a full before/after diff.

## What Worked

- The desktop app makes the core concept understandable quickly: source, target, transform, preview, delivery.
- Codex deep links are a good MVP delivery path because they avoid brittle UI automation.
- The audit log now proves local provenance for source binding, target binding, transform, and delivery attempts.
- The extension/native-host boundary keeps capture explicit and local.

## What Felt Annoying

- Native host registration is still a manual Chrome developer workflow.
- Running desktop in browser mode uses mock data, while Electron mode is needed for real deep-link opening.
- The repo path field needs a directory picker.
- The extension ID has to be copied into a manifest template by hand.

## What Broke Or Is Thin

- Generic Windows app delivery is service-level, not a complete UI.
- ChatGPT latest-message capture is selector-fragile and should stay secondary to selected text.
- Existing Codex thread continuation is not available through the deep-link MVP.
- Delivery result observation is limited to "opened link" rather than seeing Codex thread progress.

## What Is Unsafe

- Clipboard fallback remains inherently risky and must stay approval-gated.
- Terminal targets need extra command-execution warnings.
- Consumer AI web capture needs continued terms-risk discipline: explicit user action only, no polling.
- Wrong-target prevention needs the UI to show original and current target metadata side by side before unblocking delivery.

## Useful Tomorrow

- Add a directory picker for Codex repo path.
- Make "selected text to Codex" work with one extension click plus one desktop approval.
- Add a target diff panel with a hard block when process/path changes.
- Add a first-run setup wizard for native host registration.

## Continue/Kill Criteria

- Continue if a developer uses at least five handoffs per workday after setup.
- Continue if successful handoff latency is under 10 seconds after capture.
- Continue if wrong-target or failed-delivery rate stays below 1% in manual dogfood.
- Kill or pivot if users mostly treat it as a clipboard wrapper and ignore audit/provenance.
- Kill or pivot if native host setup remains the dominant support issue after a setup wizard.
